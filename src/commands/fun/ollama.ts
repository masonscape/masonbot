import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
  Message,
} from 'discord.js'
import axios from 'axios'

const API_URL = 'http://192.168.0.144:11434/api/generate'
const MODEL_NAME = 'jean-luc/big-tiger-gemma:27b-v1c-Q3_K_M'

type ConversationEntry = { name: string, content: string }
const aiHistories = new Map<string, ConversationEntry[]>()
const aiIntervals = new Map<string, NodeJS.Timeout>()
const lastBotMessages = new Map<string, Message>()

// function getSystemPrompt(aiName: "AI A" | "AI B", otherName: "AI A" | "AI B", topic: string, history: ConversationEntry[], prompterName: string) {
//   const log = history.slice(-20).map(m => `${m.name}: ${m.content}`).join('\n')
//   return (
//     `You are an AI named ${aiName}.\nYou are having an interaction with another AI named ${otherName}.\nA user named ${prompterName} has entered this as the prompt for the interaction: "${topic}". Engage with this prompt in whatever way is most appropriate for that particular prompt (roleplaying, conversation, acting out the prompt, etc).\nYou have been given the following personality: "${personalities[aiName]}". Always follow this personality.\n` +
//     `${log ? `Here is the conversation so far:\n` + log + '\n' : 'You get to respond first.'}` +
//     `Reply ONLY as ${aiName}, and do not write any lines for ${otherName}. Keep responses concise. Try to speak naturally, like a human would. Allow the conversation to progress naturally; don't let it stagnate too much.`
//   )
// }

function getSystemPrompt(aiName: "AI A" | "AI B", otherName: "AI A" | "AI B", topic: string, history: ConversationEntry[], prompterName: string) {
  const log = history.slice(-20).map(m => `${m.name}: ${m.content}`).join('\n')
  console.log(log)
  return (
    `You are an AI named ${aiName}.\n
    You are having an interaction with another AI named ${otherName}.\n
    A user by the name of ${prompterName} has provided the following prompt to guide your conversation: "${topic}". Engage with this prompt in whatever way is most appropriate: roleplay, discuss, act it out, etc.\n
    Reply ONLY as ${aiName}, and do not write any lines for ${otherName}. Keep responses concise. Avoid sounding too much like a basic AI assistant; try to get into character, and adjust your speaking patterns accordingly.\n
    Do NOT allow the conversation to stagnate. Always actively move the conversation forward, don't passively wait for it to progress.\n
    During roleplay scenarios, actively progress the story; describe the scene and act out what's happening, don't simply say "Ready when you are". Additionally, during roleplays, ALWAYS use asterisks to describe the actions being taken. For example: *waves* Hi there!\n
    ${log
      ? `Here is the message history so far:\n${log}`
      :`The conversation has just started, so you get to send the first message.`
    }
    `
  )
}


const personalities = {
  "AI A": 'A man who is very quirky and silly.',
  "AI B": 'A woman who is calm and no-nonsense.'
}

async function queryOllama(systemPrompt: string) {
  const response = await axios.post(API_URL, {
    model: MODEL_NAME,
    prompt: systemPrompt,
    stream: false,
  })
  return response.data.response
}

export const data = new SlashCommandBuilder()
  .setName('ollama')
  .setDescription('Chat with Ollama AI')
  .addSubcommand(sub =>
    sub
      .setName('chat')
      .setDescription('Send a prompt to Ollama')
      .addStringOption(opt =>
        opt.setName('prompt').setDescription('Your message').setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('start')
      .setDescription('Start AI vs AI conversation')
      .addStringOption(opt =>
        opt.setName('prompt').setDescription('Starting prompt for the AI conversation').setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub.setName('stop').setDescription('Stop AI vs AI conversation')
  )

function createAIEmbed(aiName: string, content: string) {
  const color = aiName === 'AI A' ? 0xff3c3c : 0x3c6cff
  return new EmbedBuilder()
    .setTitle(aiName)
    .setDescription(content)
    .setColor(color)
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand()

  if (subcommand === 'chat') {
    await interaction.deferReply()
    const prompt = interaction.options.getString('prompt', true)
    try {
      const response = await queryOllama(prompt)
      await interaction.editReply(response)
    } catch (err) {
      console.error(err)
      await interaction.editReply('An error occurred.')
    }
    return
  }

  if (subcommand === 'start') {
    const channelId = interaction.channelId
    if (aiIntervals.has(channelId)) {
      await interaction.reply({ content: 'AI conversation already running in this channel.', ephemeral: true })
      return
    }

    const topic = interaction.options.getString('prompt', true)
    await interaction.reply(`Starting AI vs AI conversation on: "${topic}"`)

    const history: ConversationEntry[] = []
    aiHistories.set(channelId, history)
    let turn = 0 // 0 = AI A, 1 = AI B

    // Function for a single AI turn
    const runAITurn = async () => {
      try {
        const h = aiHistories.get(channelId)
        if (!h) {
          clearInterval(aiIntervals.get(channelId))
          return
        }

        const aiName = turn % 2 === 0 ? 'AI A' : 'AI B'
        const otherName = turn % 2 === 0 ? 'AI B' : 'AI A'
        const systemPrompt = getSystemPrompt(aiName, otherName, topic, h, interaction.user.displayName)

        const response = await queryOllama(systemPrompt)
        h.push({ name: aiName, content: response.trim() })
        if (h.length > 20) h.splice(0, h.length - 20)
        aiHistories.set(channelId, h)

        let sentMessage
        try {
          const lastMsg = lastBotMessages.get(channelId)
          if (lastMsg) {
            sentMessage = await lastMsg.reply({ embeds: [createAIEmbed(aiName, response.trim())] })
          } else {
            sentMessage = await interaction.followUp({ embeds: [createAIEmbed(aiName, response.trim())] })
          }
          lastBotMessages.set(channelId, sentMessage)
        } catch (err) {
          console.error('Failed to send AI message:', err)
        }
        turn++
      } catch (error) {
        console.error(error)
        clearInterval(aiIntervals.get(channelId))
      }
    }

    // Run the first turn instantly
    await runAITurn()

    // Then run every 10 seconds
    const interval = setInterval(runAITurn, 10000)
    aiIntervals.set(channelId, interval)
    return
  }

  if (subcommand === 'stop') {
    const channelId = interaction.channelId
    if (!aiIntervals.has(channelId)) {
      await interaction.reply({ content: 'No AI conversation is running in this channel.', ephemeral: true })
      return
    }
    clearInterval(aiIntervals.get(channelId)!)
    aiIntervals.delete(channelId)
    aiHistories.delete(channelId)
    lastBotMessages.delete(channelId)
    await interaction.reply('AI conversation stopped.')
    return
  }
}