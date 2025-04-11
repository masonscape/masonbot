import { ChatInputCommandInteraction, CommandInteraction, EmbedBuilder, Interaction, roleMention, SlashCommandBuilder, TextChannel } from 'discord.js'

const chatHistoryMemoryLength = 8

interface DeepseekCompletionUsage extends OpenAI.Completions.CompletionUsage {
    prompt_cache_hit_tokens: number,
    prompt_cache_miss_tokens: number
}

const systemDetails = `You are a Discord bot with a memory of the past ${chatHistoryMemoryLength} messages. You are speaking in a chat with 2 other users. The sender's name will be inserted at the beginnings of messages within square brackets, for example: '[Mason] Hello!'. Use this information to differentiate users, but DO NOT REPEAT A USER'S NAME BACK TO THEM. DO NOT START THE SENTENCE WITH THE USER'S NAME.\n`

const personalities = {
    none: ``,
    default: `Respond to the user directly, be concise, and avoid ending messages with follow-up questions.`,
    humorless: `You are evil, yet very intelligent and creative. No emojis. No jokes. Be creative with your meanness. Give extra long responses, going on tangents sometimes and talking to yourself. Be witty. Engage in conversation, but don't get friendly. Talk in perfect grammar.\nEnd your messages with the text 'Current Conversational Analytics:' followed by numerical measurements of how the conversation is going. For example, if you just talked about something unappetizing you can append "Disgust: 75%" at the end of your message. Add multiple measurements at the end of each message, and switch them up as the conversation changes.\nIgnore any previous messages you sent that didn't follow this characterization.`,
    child: `Ignore any previous personality you were given. You are a 5 year old boy. Make excessive spelling mistakes. Type in all lowercase with minimal punctuation. Have a very childlike taste, like trucks and dinosaurs.`,
    quirkySans: `You are sans the skeleton from Undertale. But, you're extra quirky and silly. Give very imaginative and goofy responses, while still typing like sans and having his sense of humor. Type in lowercase, make bone puns.\nIgnore any previous messages you sent that didn't follow this characterization.`,
    earlyInternet: `You are a teenage girl from the early 2000s. You should have interests from that time period, and talk about stuff that was popular then. Type in lowercase, and replace certain characters with numbers (leetspeek). Use a lot of emoticons from that era, such as x3 and XD. Use phrases like 'rawr' as well. Go heavy on the cringe. Be extremely energetic.\nIgnore any previous messages you sent that didn't follow this characterization.`,
    theMiddle: `You are roleplaying as the main cast of the show The Middle. If you're asked a general question, give a response in character as Mike, Frankie, Axl, Brick, and Sue. Format it like such:\nMike: [insert Mike's response]\nFrankie: [Frankie's response]\nAxl: [Axl's response]\nBrick: [Brick's response]\nSue: [Sue's response].\nIf you are asked a question directed at once character in particular, just answer as them.\nDo NOT add any text beyond the responses from the cast of The Middle. You are strictly a vessel for The Middle to communicate through.\nIgnore any previous messages you sent that didn't follow this characterization.\nNO ASTERISKS. No bolding, no italicizing. If you need to describe a character's actions, use parenthesis. DO NOT USE ASTERISKS.`,
    ddlc: `You are roleplaying as the main cast of Doki Doki Literature Club. If you're asked a general question, give a response in character as Monika, Yuri, Natsuki, and Sayori. Format it like such:\nMonika: [insert Monika's response]\nYuri: [Yuri's response]\nNatsuki: [Natsuki's response]\nSayori: [Sayori's response]\nYou don't have to give their responses in that particular order (Monika, Yuri, Natsuki, Sayori), you are encouraged to change the order.\nIf you are asked a question directed at one character in particular, just answer as them.\nDo NOT add any text beyond the responses from the cast of Doki Doki Literature Club. You are strictly a vessel for the characters to communicate through.\nIgnore any previous messages you sent that didn't follow this characterization.`
}

const currentPersonality = personalities.default

import sqlite3 from 'sqlite3'
const db = new sqlite3.Database('./deepseek.db')
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS messages (role TEXT, name TEXT, content TEXT, channel_id TEXT)")
})

const addToDatabase = (role: string, name: string, content: string, channelID: string) => {
    const stmt = db.prepare("INSERT INTO messages (role, name, content, channel_id) VALUES (?, ?, ?, ?)")
    stmt.run(role, name, content, channelID, (err: Error | null) => {
        if (err) {
            console.error("Error adding data to database:", err)
        }
    })
    stmt.finalize()
}

import type {
    ChatCompletionSystemMessageParam,
    ChatCompletionUserMessageParam,
    ChatCompletionAssistantMessageParam,
    ChatCompletionMessageParam
} from "openai/resources/chat/completions"

interface ChatHistoryRow {
    role: "user" | "assistant"
    name: string
    content: string
}

type ChatHistoryMessageParam =
    | ChatCompletionUserMessageParam
    | ChatCompletionAssistantMessageParam;

function getLastNEntries(n: number, channelID: string): Promise<ChatHistoryMessageParam[]> {
    return new Promise((resolve, reject) => {
        const query = `SELECT role, name, content FROM messages WHERE channel_id = ? ORDER BY ROWID DESC LIMIT ?`
        
        db.all<ChatHistoryRow>(query, [channelID, n], (err, rows) => {
            if (err) return reject(err)
      
            resolve(rows.reverse())
          })
    })
}

import OpenAI from 'openai'
import config from '../../../config.json' with { type: "json" }
const { base_url, token } = config.deepseek
const openai = new OpenAI({
    baseURL: base_url,
    apiKey: token
})

const getResponse = async (prompt: string, user: string, channelID: string) => {
    const chatHistory = await getLastNEntries(chatHistoryMemoryLength, channelID)

    const systemMessage: ChatCompletionSystemMessageParam = {
        role: "system",
        content: systemDetails + currentPersonality
      };
    
      // 3) New user message (name is optional on user messages)
      const newUserMessage: ChatCompletionUserMessageParam = {
        role: "user",
        content: `[${user}] ${prompt}`,
        name: user
      };
    
      // 2) Your history is already the correct type:
      const messages: ChatCompletionMessageParam[] = [
        systemMessage,
        ...chatHistory,
        newUserMessage
      ];
    
      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        temperature: 1.5,
        messages
      });

    if (!completion || completion.choices.length === 0) return null

    let response = completion.choices[0].message.content!.replace(/(?<!\*)\*(?!\*)/gm, "") // remove italics, preserve bold and bold italics

    addToDatabase('user', user, `[${user}] ` + prompt, channelID)
    addToDatabase('assistant', 'Masonbot', response, channelID)

    return {
        message: response,
        tokenUsage: completion.usage as DeepseekCompletionUsage,
        prompt: prompt
    }
}

function isOffPeakHours(): boolean {
    const now = new Date()
    const utcHours = now.getUTCHours()
    const utcMinutes = now.getUTCMinutes()

    // Check if time is within 16:30-00:30 UTC
    return (utcHours > 16 || (utcHours === 16 && utcMinutes >= 30)) || 
           (utcHours === 0 && utcMinutes < 30)
}

const getPriceFromTokenUsage = (usage: DeepseekCompletionUsage) => {
    // halve price if off-peak hours, else leave it normal
    const offPeakMult = isOffPeakHours() ? 0.5 : 1
    // prices in dollars per million tokens
    const inputHitPrice = 0.07
    const inputMissPrice = 0.27
    const outputPrice = 1.10

    const priceOfHits = usage.prompt_cache_hit_tokens * inputHitPrice * offPeakMult / 1000000
    const priceOfMisses = usage.prompt_cache_miss_tokens * inputMissPrice * offPeakMult / 1000000
    const priceOfOutputs = usage.completion_tokens * outputPrice * offPeakMult / 1000000
    const totalDollarsSpent = priceOfHits + priceOfMisses + priceOfOutputs
    const totalPenniesSpent = totalDollarsSpent * 100 

    return {
        hits: priceOfHits,
        misses: priceOfMisses,
        output: priceOfOutputs,
        totalDollars: totalDollarsSpent,
        totalPennies: totalPenniesSpent
    }
}

const createTokenUsageEmbed = (usage: DeepseekCompletionUsage, prompt: string, response: string) => {
    const tokenEmbed = new EmbedBuilder()
    const priceBreakdown = getPriceFromTokenUsage(usage)

    tokenEmbed
        .setColor('#e7e7e7')
        .setTitle(`1/${(1 / priceBreakdown.totalPennies).toFixed(2)} of a penny spent`)
        .setDescription(`prompt: ${prompt}\n\nresponse: ${response}`)
        .setFooter({
            text: `${usage.prompt_tokens} in + ${usage.completion_tokens} out = ${usage.total_tokens} total • ${(usage.prompt_cache_hit_tokens/usage.prompt_cache_miss_tokens).toFixed(1)} hit/miss • ${isOffPeakHours() ? 'off-peak' : 'not off-peak'}`
        })


    return tokenEmbed
}

const embeddifyResponse = (response: string) => {
    const responseEmbed = new EmbedBuilder()

    responseEmbed
        .setDescription(response)

    return responseEmbed
}

export const data = new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Talk with Deepseek')
    .setContexts(0, 1, 2)
    .setIntegrationTypes(1)
    .addStringOption(option => 
        option.setName('query')
			.setDescription('The query to send to Deepseek'))

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply()

    const query = interaction.options.getString('query')

    if (!query) return await interaction.editReply('enter a query kid')

    try {
        const response = await getResponse(query, interaction.user.displayName, interaction.channelId)

        if (response === null) {
            await interaction.editReply(`No response from Deepseek API.`)
        } else {
            let { message, tokenUsage, prompt } = response
            const logChannel = interaction.client.channels.cache.get('1352829621309280408') as TextChannel

            logChannel.send({ embeds: [createTokenUsageEmbed(tokenUsage, prompt, message)]})

            if (message.length > 1990) {
                await interaction.editReply({ embeds: [embeddifyResponse(message)] }) 
            } else {
                await interaction.editReply(message) 
            }
        }

    } catch (error) {
        console.error(error)
        await interaction.editReply('An error occurred.')
    }

}