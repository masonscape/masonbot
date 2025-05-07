import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonInteraction, 
  ButtonStyle, 
  ChatInputCommandInteraction, 
  ComponentType, 
  EmbedBuilder, 
  SlashCommandBuilder, 
  AttachmentBuilder 
} from "discord.js"
import axios from "axios"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const API_URL = "http://192.168.0.144:7861/sdapi/v1/txt2img"
const OUTPUT_DIR = path.join(__dirname, "output")
const MODEL_NAME = 'sdXL_v10VAEFix.safetensors'

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR)
}

async function setModel(modelName: string) {
  try {
    await axios.post(API_URL, { sd_model_checkpoint: modelName })
    console.log(`Model set to: ${modelName}`)
  } catch (err) {
    console.error("Error setting model:", (err as Error).message)
  }
}

setModel(MODEL_NAME)

async function generateImage(prompt: string): Promise<string | void> {
  try {
    const response = await axios.post(API_URL, {
      prompt,
      steps: 6,
      sampler_name: "DPM++ SDE",
      scheduler: 'Karras',
      cfg_scale: 2.0,
      width: 512,
      height: 512,
    })

    const base64Image = response.data.images[0] as string
    const buffer = Buffer.from(base64Image, "base64")

    const filename = `image_${Date.now()}.png`
    const filePath = path.join(OUTPUT_DIR, filename)

    fs.writeFileSync(filePath, buffer)

    return filePath
  } catch (err) {
    console.error("Error generating image:", (err as Error).message)
  }
}

function createActionRow(disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(Date.now().toString())
      .setLabel('🔁')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled)
  )
}

function createImageEmbed(prompt: string, imagePath?: string) {
  const embed = new EmbedBuilder()
    .setColor('#e7e7e7')
    .setDescription(prompt)

  if (imagePath) {
    embed.setImage('attachment://' + path.basename(imagePath))
  }

  return embed
}

async function handleButtonInteraction(interaction: ButtonInteraction, prompt: string) {
  await interaction.editReply({ components: [createActionRow(true)] })

  const newImagePath = await generateImage(prompt)

  const replyOptions = newImagePath
    ? {
        embeds: [createImageEmbed(prompt, newImagePath)],
        components: [createActionRow(false)],
        files: [new AttachmentBuilder(newImagePath)],
      }
    : {
        content: 'Failed to regenerate the image',
        components: [createActionRow(false)],
        embeds: [],
        files: [],
      }

  await interaction.editReply(replyOptions)

  if (newImagePath) {
    await waitForButtonInteraction(interaction, prompt)
  }
}

async function waitForButtonInteraction(interaction: ButtonInteraction | ChatInputCommandInteraction, prompt: string) {
  try {
    const message = await interaction.fetchReply()
    const buttonInteraction = await message.awaitMessageComponent({
      componentType: ComponentType.Button
    })

    if (buttonInteraction) {
      await buttonInteraction.deferUpdate()
      await handleButtonInteraction(buttonInteraction, prompt)
    }
  } catch (err) {
    console.log('Button interaction timeout or error:', err)
  }
}

export const data = new SlashCommandBuilder()
  .setName('sd')
  .setDescription('Generate an image with Stable Diffusion')
  .addStringOption(option =>
    option.setName('prompt')
      .setDescription('The image prompt')
  )

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply()

  const prompt = interaction.options.getString('prompt')

  if (!prompt) {
    return await interaction.editReply('Enter a prompt kid')
  }

  try {
    const imagePath = await generateImage(prompt)

    if (!imagePath) {
      await interaction.editReply(`No response from AUTOMATIC1111 API.`)
    } else {
      const row = createActionRow(false)
      const file = new AttachmentBuilder(imagePath)

      await interaction.editReply({
        embeds: [createImageEmbed(prompt, imagePath)],
        components: [row],
        files: [file],
      })

      await waitForButtonInteraction(interaction, prompt)
    }
  } catch (error) {
    console.error(error)
    await interaction.editReply('An error occurred.')
  }
}
