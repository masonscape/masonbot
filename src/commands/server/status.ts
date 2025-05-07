import { ApplicationIntegrationType, ChatInputCommandInteraction, ColorResolvable, CommandInteraction, Embed, EmbedBuilder, Interaction, InteractionContextType, SlashCommandBuilder, TextChannel } from 'discord.js'

import config from '../../../config.json' with { type: "json" }
const { server } = config

type Disk = {
    name: string,
    temperature: number,
    smartPassed: boolean
}

type CPU = {
    temperature: number,
    load: number
}

type RAM = {
    utilization: {
        active: number,
        total: number
    },
    ecc: {
        uncorrected: number,
        corrected: number,
        result: string
    }
}

type ServerInfo = {
    uptime: number,
    cpu: CPU,
    disk: Disk[],
    ram: RAM
}

const getServerInfo = async (): Promise<ServerInfo | null> => {
    try {
        const res = await fetch(`${server}/serverinfo`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
    } catch {
        return null
    }
}

const checkCpu = (cpu: CPU) => {
    return cpu.load <= 0.5 && cpu.temperature <= 80
}

const checkDisks = (disks: Disk[]) => {
    return disks.every(disk => disk.smartPassed === true && disk.temperature <= 45)
}

const checkRam = (ram: RAM) => {
    return ram.ecc.corrected === 0 && ram.ecc.uncorrected === 0 && ram.ecc.result === "No errors to report." && ram.utilization.active / ram.utilization.total <= 0.9
}

// TODO: 
// zfs info (zfs status)
// load average (cat /proc/loadavg)

const createServerInfoEmbeds = (serverInfo: ServerInfo) => {
    const { uptime, cpu, cpu: { temperature, load }, disk, ram, ram: { utilization: { active, total }, ecc: { uncorrected, corrected, result } } } = serverInfo
    
    const [cpuOkay, disksOkay, ramOkay] = [checkCpu(cpu), checkDisks(disk), checkRam(ram)]

    const mainEmbed = new EmbedBuilder()
        .setTitle(cpuOkay && disksOkay && ramOkay ? 'Everything OK' : 'One or more problems!')
        .setColor(cpuOkay && disksOkay && ramOkay ? '#e7e7e7' : '#ff0000')
        .setDescription(`Online for ${(uptime / 60 / 60 / 24).toFixed(2)} days`)

    const cpuEmbed = new EmbedBuilder()
        .setColor(cpuOkay ? '#e7e7e7' : "#ff0000")
        .setTitle(cpuOkay ? 'CPU OK' : 'One or more CPU problems!')
        .addFields([
            {
                name: 'Temp',
                value: cpu.temperature + ' C',
                inline: true
            },
            {
                name: 'Load',
                value: (cpu.load * 100) + '%',
                inline: true
            }
        ])

    const diskEmbed = new EmbedBuilder()
        .setColor(disksOkay ? '#e7e7e7' : '#ff0000')
        .setTitle(disksOkay ? 'Disks OK' : 'One or more disk problems!')
        .addFields(disk.map(disk => {
            return {
                name: disk.name,
                value: disk.temperature + " C",
                inline: true
            }
        }))

    const ramEmbed = new EmbedBuilder()
        .setColor(ramOkay ? '#e7e7e7' : '#ff0000')
        .setTitle(ramOkay ? 'Ram OK' : 'One or more RAM problems!')
        .setFooter({ text: `${uncorrected}/${corrected} - ${result}`})
        .setDescription(`Using **${active.toFixed(2)}** GiB (${(active / total * 100).toFixed(1)}%)`)


    return [mainEmbed, cpuEmbed, diskEmbed, ramEmbed]
}

export const data = new SlashCommandBuilder()
    .setName('status')
    .setDescription('Shows the status of the server')
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply()

    const logChannel = interaction.client.channels.cache.get('1352829621309280408') as TextChannel
    const serverInfo = await getServerInfo()
    if (!serverInfo) return await interaction.editReply('API error while fetching system status.')
    const serverInfoEmbeds = createServerInfoEmbeds(serverInfo)

    if (interaction.user.id === '264590999479648268') {
        await interaction.editReply({ embeds: serverInfoEmbeds})
    } else {
        await interaction.editReply('girl you are not mason 😭')
    }
}