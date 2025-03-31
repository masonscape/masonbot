import { ChatInputCommandInteraction, CommandInteraction, EmbedBuilder, Interaction, SlashCommandBuilder, TextChannel } from 'discord.js'

import config from '../../../config.json' with { type: "json" }
const { server } = config

const getDiskInfo = async () => {
    const res = await fetch(`${server}/diskinfo`)

    if (!res.ok) {
        throw new Error(`error fetching disk info, status ${res.status}`)
    }

    const data = await res.json()
    return data
}

const isTempGood = (disk) => {
    if (disk.type === "HD") {
        return disk.temperature <= 45
    } else if (disk.type = "NVMe") {
        return disk.temperature <= 60
    }
}

const createDiskInfoEmbed = (data) => {
    const diskInfoEmbed = new EmbedBuilder()
    const allSmartGood = data.every(disk => disk.smartStatus === "Ok")
    const allTempsGood = data.every(disk => isTempGood(disk))
    const allGood = allSmartGood && allTempsGood

    diskInfoEmbed
        .setColor(allGood ? '#e7e7e7' : '#ff0000')
        .setTitle(allGood ? "Disks OK" : allSmartGood ? "One or more drives are too hot!" : "One or more SMART failures!")

    data.forEach(disk => {
        diskInfoEmbed.addFields(
            { 
                name: `${disk.smartStatus === "Ok" ? "" : "⚠️ "}${disk.device}`, 
                value: `${!isTempGood(disk) ? "❗ " : ""}${disk.temperature}°`,
                inline: false
            }
        )
    })

    return diskInfoEmbed
}

const getECCInfo = async () => {
    const res = await fetch(`${server}/eccinfo`)

    if (!res.ok) {
        throw new Error(`error fetching ecc info, status ${res.status}`)
    }

    const data = await res.json()
    return data
}

const extractECCData = (data: string) => {
    const uncorrected = data.match(/(\d+) Uncorrected/)[1]
    const corrected = data.match(/(\d+) Corrected/)[1]
    const conclusion = data.match(/edac-util: (.+)/)[1]
    
    console.log(conclusion)

    return [uncorrected, corrected, conclusion]
}


const createECCEmbed = (data) => {
    const eccEmbed = new EmbedBuilder()
    const extractedData = extractECCData(data)

    eccEmbed
        .setColor('#e7e7e7')
        .setTitle(extractedData[2])
        .setDescription(`${extractedData[0]} uncorrected\n${extractedData[1]} corrected`)


    return eccEmbed
}

const getUptime = async () => {
    const res = await fetch(`${server}/uptime`)

    if (!res.ok) {
        throw new Error(`error fetching ecc info, status ${res.status}`)
    }

    const data = await res.json()
    return data
}

export const data = new SlashCommandBuilder()
    .setName('status')
    .setDescription('Shows the status of a system on the server')
    .setContexts(0, 1, 2)
    .setIntegrationTypes(1)
    .addSubcommand(subcommand =>
        subcommand.setName('disk')
            .setDescription('Shows disk status')
    )
    .addSubcommand(subcommand =>
        subcommand.setName('ecc')
            .setDescription('Shows ECC status')
    )
    .addSubcommand(subcommand =>
        subcommand.setName('uptime')
            .setDescription('Shows server uptime')
    )

export async function execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand()
    
    const logChannel = interaction.client.channels.cache.get('1352829621309280408') as TextChannel

    if (interaction.user.id === '264590999479648268') {
        if (subcommand === 'disk') {
            const diskInfo = await getDiskInfo()
        
            await interaction.reply({ embeds: [createDiskInfoEmbed(diskInfo)]})    
        } else if (subcommand === 'ecc') {
            const eccInfo = await getECCInfo()
        
            await interaction.reply({ embeds: [createECCEmbed(eccInfo)]});
        } else if (subcommand === 'uptime') {
            const uptime = await getUptime()

            await interaction.reply(`${(uptime / 60 / 60 / 24).toFixed(1)} days`)
        } else {
            await interaction.reply('no subcommand?')
        }
    } else {
        await interaction.reply('girl you are not mason 😭')
    }
}