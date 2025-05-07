import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js"

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
    await axios.post(API_URL, {
      sd_model_checkpoint: modelName
    })
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

export const data = new SlashCommandBuilder()
    .setName('sd')
    .setDescription('Generate an image with Stable Diffusion')
    .setContexts(0, 1, 2)
    .setIntegrationTypes(1)
    .addStringOption(option => 
        option.setName('prompt')
			.setDescription('The image prompt'))

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply()

  const prompt = interaction.options.getString('prompt')

  if (!prompt) return await interaction.editReply('enter a prompt kid')

  try {
    const response = await generateImage(prompt)

    if (typeof response !== 'string') {
      await interaction.editReply(`No response from AUTOMATIC1111 API.`)
    } else {
      await interaction.editReply({
        content: prompt,
        files: [response]
      }) 
    }
  } catch (error) {
    console.error(error)
    await interaction.editReply('An error occurred.')
  }
}