import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, ColorResolvable, ComponentType, EmbedBuilder, SlashCommandBuilder, Interaction, ButtonInteraction, CacheType } from 'discord.js'
import { createCanvas, loadImage } from 'canvas'
import { AttachmentBuilder } from 'discord.js'

import pokedexJson from './pokedex.json' with { type: 'json' } // pokedex.json is from https://github.com/Purukitto/pokemon-data.json/blob/master/pokedex.json
const pokedex = pokedexJson as Pokemon[]
import swshList from './swshlist.json' with { type: 'json' }

import Fuse from 'fuse.js'
const fuse = new Fuse(swshList, {
  includeScore: true
})

type TypeName = 'Normal' | 'Fire' | 'Water' | 'Electric' | 'Grass' | 'Ice' | 'Fighting' | 'Poison' | 'Ground' | 'Flying' | 'Psychic' | 'Bug' | 'Rock' | 'Ghost' | 'Dragon' | 'Dark' | 'Steel' | 'Fairy'

type Pokemon = {
  name: {
    english: string
    [key: string]: any
  }
  type: TypeName[]
  [key: string]: any
}

type TypeEffectiveness = Record<TypeName, Partial<Record<TypeName, number>>>

const typeChart: TypeEffectiveness = {
  Normal:     { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fire:       { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water:      { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric:   { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
  Grass:      { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
  Ice:        { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting:   { Normal: 2, Ice: 2, Rock: 2, Dark: 2, Steel: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Ghost: 0, Fairy: 0.5 },
  Poison:     { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
  Ground:     { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying:     { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic:    { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
  Bug:        { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
  Rock:       { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost:      { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon:     { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Dark:       { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel:      { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Fairy: 2, Steel: 0.5 },
  Fairy:      { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 }
}

import sqlite3 from 'sqlite3'
const db = new sqlite3.Database('./pokedex.db')
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS caught (name TEXT PRIMARY KEY, time INTEGER NOT NULL)
  `)
})

const catchPokemon = async (name: string) => {
  const result = fuse.search(name)[0]
  if (!result) return { success: false, reason: 'not_found' }

  const realName = result.item

  try {
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO caught (name, time) VALUES (?, ?)`,
        [realName, Date.now()],
        err => {
          if (err) reject(err)
          else resolve()
        }
      )
    })

    return { success: true, name: realName }
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT') {
      return { success: false, reason: 'already_caught', name: realName }
    } else {
      throw err // let other errors propagate
    }
  }
}


const uncatchPokemon = async (name: string) => {
  const realName = fuse.search(name)[0].item
  if (!realName) return

  await db.run(`DELETE FROM caught WHERE name = ?`, [realName])

  return realName
}

function getAllCaughtPokemon(): Promise<[string, Date][]> {
  return new Promise((resolve, reject) => {
    const query = `SELECT name, time FROM caught ORDER BY time ASC`

    db.all<{ name: string; time: number }>(query, [], (err, rows) => {
      if (err) return reject(err)

      const result = rows.map(row => [row.name, new Date(row.time)] as [string, Date])
      resolve(result)
    })
  })
}

function pokemonHasBeenCaught(name: string) {
  const realName = fuse.search(name)[0]?.item

  return new Promise<{ name: string; time: number } | undefined>((resolve, reject) => {
    if (!realName) return reject(`Couldn't find that Pokemon`)

    db.get<{ name: string; time: number }>(
      `SELECT name, time FROM caught WHERE name = ? LIMIT 1`,
      [realName],
      (err, row) => {
        if (err) return reject(err)
        resolve(row) // row is undefined if not found
      }
    )
  })
}

const typeDecoration: Record<TypeName, [ColorResolvable, string]> = {
  "Normal": ["#A8A77A", "<:Normal:1387086491616018505>"],
  "Fire": ["#EE8130", "<:Fire:1387086526839787674>"],
  "Water": ["#6390F0", "<:Water:1387086461035089950>"],
  "Electric": ["#F7D02C", "<:Electric:1387086101977501868>"],
  "Grass": ["#7AC74C", "<:Grass:1387086515938525296>"],
  "Ice": ["#96D9D6", "<:Ice:1387086484972245102>"],
  "Fighting": ["#C22E28", "<:Fighting:1387086547282563214>"],
  "Poison": ["#A33EA1", "<:Poison:1387086499975266458>"],
  "Ground": ["#E2BF65", "<:Ground:1387086520887939142>"],
  "Flying": ["#A98FF3", "<:Flying:1387086532808278096>"],
  "Psychic": ["#F95587", "<:Psychic:1387086470187192502>"],
  "Bug": ["#A6B91A", "<:Bug:1387086593289879672>"],
  "Rock": ["#B6A136", "<:Rock:1387086478286258186>"],
  "Ghost": ["#735797", "<:Ghost:1387086508888162404>"],
  "Dragon": ["#6F35FC", "<:Dragon:1387086560171917475>"],
  "Dark": ["#705746", "<:Dark:1387086580493062334>"],
  "Steel": ["#B7B7CE", "<:Steel:1387086452625510460>"],
  "Fairy": ["#D685AD", "<:Fairy:1387086539594666154>"]
}

const getPokemon = (name: string): Pokemon => {
  return pokedex.filter(pokemon => pokemon.name.english === name)[0]
}

function getTypeEffectiveness(types: TypeName[]) {
  const result = {} as Record<TypeName, number>

  for (const attackType of Object.keys(typeChart) as TypeName[]) {
    let mult = 1

    for (const defType of types) {
      const eff = typeChart[attackType]?.[defType] ?? 1
      mult *= eff
    }

    if (mult !== 1) {
      result[attackType] = mult
    }
  }

  return result
}

const filterEffectiveness = (effectiveness: Record<TypeName, number>, multiplier: number): TypeName[] => {
  return Object.entries(effectiveness)
    .filter(([_, value]) => value === multiplier)
    .map(([key]) => key as TypeName)
}

const createActionRow = (customIdCatch: string, customIdRelease: string, caught: boolean) => {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customIdCatch)
      .setLabel('Catch')
      .setStyle(ButtonStyle.Success)
      .setDisabled(caught),
    new ButtonBuilder()
      .setCustomId(customIdRelease)
      .setLabel('Release')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!caught)
  )
}

import { SlashCommandSubcommandBuilder } from 'discord.js'

// --- Canvas builder (already async) ---
async function buildDexGridCanvas(
  pokedex: Pokemon[],
  swshList: string[],
  caughtSet: Set<string>,
  page: number,
  gridSize = 5,
  cellSize = 96,
  padding = 8,
  nameFontSize = 14,
  numberFontSize = 14,
  highlightCellIdx?: number // index of cell to highlight (0-24)
) {
  const labelHeight = nameFontSize + 4
  const canvasWidth = gridSize * (cellSize + padding) + padding
  const canvasHeight = gridSize * (cellSize + padding) + padding + labelHeight
  const canvas = createCanvas(canvasWidth, canvasHeight)
  const ctx = canvas.getContext('2d')

  // ctx.fillStyle = '#222'
  // ctx.fillRect(0, 0, canvas.width, canvas.height)

  const startIdx = (page - 1) * gridSize * gridSize
  const names = swshList.slice(startIdx, startIdx + gridSize * gridSize)
  const pokes = names.map(name => pokedex.find(p => p.name.english === name))

  for (let i = 0; i < pokes.length; ++i) {
    const poke = pokes[i]
    if (!poke) continue
    const row = Math.floor(i / gridSize)
    const col = i % gridSize
    const x = padding + col * (cellSize + padding)
    const y = padding + row * (cellSize + padding)

    // No outline, just highlight text if selected

    const imgUrl = poke.image?.sprite || poke.image?.thumbnail || poke.image?.hires
    if (!imgUrl) continue

    // Draw image with reduced opacity if not caught
    try {
      const img = await loadImage(imgUrl)
      ctx.save()
      const caught = caughtSet.has(poke.name.english)
      ctx.globalAlpha = caught ? 1 : 0.5
      ctx.drawImage(img, x, y, cellSize, cellSize)
      ctx.restore()
    } catch (e) {
      // ignore image load errors
    }

    // Draw pokedex number (index+1) a bit lower in the image
    ctx.save()
    ctx.font = `bold ${numberFontSize}px sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    const caught = caughtSet.has(poke.name.english)
    // If this is the highlighted cell, use yellow, else white (caught) or red (uncaught)
    let numColor = '#fff'
    if (highlightCellIdx !== undefined && i === highlightCellIdx) {
      numColor = caught ? '#ffe600' : '#bfa600'
    } else {
      numColor = caught ? '#fff' : '#ff5555'
    }
    ctx.fillStyle = numColor
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    const numStr = `${startIdx + i + 1}`
    ctx.strokeText(numStr, x + 4, y + 10)
    ctx.fillText(numStr, x + 4, y + 10)
    ctx.restore()

    // Draw name a little higher below image, centered
    ctx.save()
    ctx.font = `bold ${nameFontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    // If this is the highlighted cell, use yellow, else white (caught) or red (uncaught)
    let nameColor = '#fff'
    if (highlightCellIdx !== undefined && i === highlightCellIdx) {
      nameColor = caught ? '#ffe600' : '#bfa600'
    } else {
      nameColor = caught ? '#fff' : '#ff5555'
    }
    ctx.fillStyle = nameColor
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    const nameStr = poke.name.english
    const nameY = y + cellSize - 8
    ctx.strokeText(nameStr, x + cellSize / 2, nameY)
    ctx.fillText(nameStr, x + cellSize / 2, nameY)
    ctx.restore()
  }

  return canvas
}

// --- Pagination row builder ---
function buildDexPaginationRow(page: number, totalPages: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`dexpage_prev_${page}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`dexpage_next_${page}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages)
  )
}

// --- Pagination logic helpers ---
function getPageFromButton(customId: string, totalPages: number): number | null {
  const prevMatch = customId.match(/^dexpage_prev_(\d+)$/)
  if (prevMatch) {
    const prevPage = parseInt(prevMatch[1], 10)
    return Math.max(1, prevPage - 1)
  }
  const nextMatch = customId.match(/^dexpage_next_(\d+)$/)
  if (nextMatch) {
    const nextPage = parseInt(nextMatch[1], 10)
    return Math.min(totalPages, nextPage + 1)
  }
  return null
}

// --- handleDexGrid helper ---
async function handleDexGrid(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  page: number,
  totalPages: number,
  isButton: boolean
) {
  const caughtArr = await getAllCaughtPokemon()
  const caughtSet = new Set(caughtArr.map(([name]) => name))
  const canvas = await buildDexGridCanvas(
    pokedex,
    swshList,
    caughtSet,
    page
  )
  const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'dexgrid.png' })
  const row = buildDexPaginationRow(page, totalPages)

  if (interaction instanceof ButtonInteraction) {
    // Always acknowledge and update for button interactions
    await interaction.update({ files: [attachment], components: [row] })
  } else {
    // Only reply if not already replied/deferred
    if ('reply' in interaction && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ files: [attachment], components: [row], ephemeral: true })
    }
  }
}

const formatTypeList = (strong: TypeName[], weak: TypeName[]) => {
  const parts = [
    strong.length > 0 ? ' **(** ' : '',
    ...strong.map(t => `${typeDecoration[t][1]}`),
    strong.length > 0 ? ' **)** ' : '',
    ...weak.map(t =>   `${typeDecoration[t][1]}`)
  ]
  return parts.join(` `)
}

// --- createPokemonEmbed helper ---
const createPokemonEmbed = async (pokemon: Pokemon) => {
  // Restore the original embed logic for /dex find
  const effectiveness = getTypeEffectiveness(pokemon.type)

  const immune = filterEffectiveness(effectiveness, 0)
  const quadWeak = filterEffectiveness(effectiveness, 4)
  const doubleWeak = filterEffectiveness(effectiveness, 2)
  const halfResist = filterEffectiveness(effectiveness, 0.5)
  const quarterResist = filterEffectiveness(effectiveness, 0.25)
  const caught = await pokemonHasBeenCaught(pokemon.name.english)

  const fields = []

  const weakLine = formatTypeList(quadWeak, doubleWeak)
  if (weakLine) {
    fields.push({
      name: 'Weak to',
      value: weakLine,
      inline: false
    })
  }

  const resistLine = formatTypeList(quarterResist, halfResist)
  if (resistLine) {
    fields.push({
      name: 'Resists',
      value: resistLine,
      inline: false
    })
  }

  const immuneLine = formatTypeList([], immune)
  if (immuneLine) {
    fields.push({
      name: 'Immune to',
      value: immuneLine,
      inline: false
    })
  }

  const embed = new EmbedBuilder()
    .setTitle(`${pokemon.type.map(type => typeDecoration[type][1]).join(' ')} ${pokemon.name.english}`)
    .setColor(caught ? '#00ff00' : '#ff0000')
    .addFields(fields)
    .setThumbnail(pokemon.image?.hires)
  embed.setFooter({
    text: caught ? 'Caught on ' + new Date(caught.time).toLocaleString() : 'Uncaught'
  })

  return embed
}

// --- Command builder ---
export const data = new SlashCommandBuilder()
  .setName('dex')
  .setDescription('A helpful command for completing the Pokedex in Pokemon Sword and Shield')
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub
      .setName('view')
      .setDescription('View a page of the dex, or jump to a Pokémon')
      .addStringOption(opt =>
        opt.setName('page')
          .setDescription('Page number (1-based) or Pokémon name')
          .setRequired(true)
      )
  )
  .addSubcommand((sub: SlashCommandSubcommandBuilder) =>
    sub
      .setName('find')
      .setDescription('Find a Pokémon and show its info')
      .addStringOption(opt =>
        opt.setName('pokemon')
          .setDescription('The Pokemon to search for')
          .setRequired(true)
      )
  )

// --- Main execute function ---
export async function execute(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  if (interaction.user.id !== "264590999479648268") {
    if ('reply' in interaction) {
      return interaction.reply({ content: 'buzz off kid', ephemeral: true })
    }
    return
  }

  // --- BUTTON HANDLER: Use imagegen.ts's working pattern for /dex view pagination ---
  // Only handle pagination for /dex view here, not catch/release
  if (interaction instanceof ButtonInteraction && (interaction.customId.startsWith('dexpage_prev_') || interaction.customId.startsWith('dexpage_next_'))) {
    // Disable buttons immediately
    await interaction.editReply({ components: [buildDexPaginationRow(0, 0)] })

    // Parse page number
    const gridSize = 5
    const perPage = gridSize * gridSize
    const totalPages = Math.ceil(swshList.length / perPage)
    const page = getPageFromButton(interaction.customId, totalPages) ?? 1

    // Build canvas for the new page
    const caughtArr = await getAllCaughtPokemon()
    const caughtSet = new Set(caughtArr.map(([name]) => name))
    const canvas = await buildDexGridCanvas(pokedex, swshList, caughtSet, page)
    const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'dexgrid.png' })
    const row = buildDexPaginationRow(page, totalPages)

    // Edit reply to show new canvas and new buttons
    await interaction.editReply({
      content: '',
      files: [attachment],
      components: [row],
      embeds: []
    })

    // Wait for next button press (recursive loop)
    try {
      const message = await interaction.fetchReply()
      const buttonInteraction = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 60000
      })
      await buttonInteraction.deferUpdate()
      await execute(buttonInteraction)
    } catch (err) {
      // Timeout or error, just remove buttons
      await interaction.editReply({ components: [] })
    }
    return
  }

  // --- Parse subcommand/options for slash commands ---
  let subcommand: string | null = null
  let viewPageArg: string | null = null
  let findPokemonArg: string | null = null

  if ('options' in interaction && typeof interaction.options.getSubcommand === 'function') {
    try {
      subcommand = interaction.options.getSubcommand()
    } catch {}
    if (subcommand === 'view') {
      viewPageArg = interaction.options.getString('page')
    } else if (subcommand === 'find') {
      findPokemonArg = interaction.options.getString('pokemon')
    }
  }

  const gridSize = 5
  const perPage = gridSize * gridSize
  const totalPages = Math.ceil(swshList.length / perPage)

  // --- /dex view subcommand logic ---
  if (subcommand === 'view') {
    let resolvedPage = 1
    let highlightCellIdx: number | undefined = undefined

    if (viewPageArg) {
      const pageNum = parseInt(viewPageArg, 10)
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        resolvedPage = pageNum
      } else {
        // Try to fuzzy search for a Pokémon name
        const result = fuse.search(viewPageArg)[0]
        if (result) {
          const pokeName = result.item
          const pokeIdx = swshList.findIndex(n => n === pokeName)
          if (pokeIdx !== -1) {
            resolvedPage = Math.floor(pokeIdx / perPage) + 1
            highlightCellIdx = pokeIdx % perPage
          }
        }
      }
    }
    const row = buildDexPaginationRow(resolvedPage, totalPages)
    // Build canvas for the first page, with highlight if needed
    const caughtArr = await getAllCaughtPokemon()
    const caughtSet = new Set(caughtArr.map(([name]) => name))
    const canvas = await buildDexGridCanvas(
      pokedex,
      swshList,
      caughtSet,
      resolvedPage,
      5,
      96,
      8,
      14,
      14,
      highlightCellIdx
    )
    const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'dexgrid.png' })

    await interaction.reply({
      content: '',
      files: [attachment],
      components: [row],
      embeds: [],
      ephemeral: true
    })

    // Wait for button press (start the loop)
    try {
      const message = await interaction.fetchReply()
      const buttonInteraction = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 60000
      })
      await buttonInteraction.deferUpdate()
      await execute(buttonInteraction)
    } catch (err) {
      // Timeout or error, just remove buttons
      await interaction.editReply({ components: [] })
    }
    return
  }

  // --- /dex find subcommand logic ---
  if (subcommand === 'find' && findPokemonArg) {
    try {
      const searchedPokemon = fuse.search(findPokemonArg)[0]

      if (searchedPokemon) {
        const pokeName = searchedPokemon.item
        const pokeData = getPokemon(pokeName)
        const caught = await pokemonHasBeenCaught(pokeName)
        const embed = await createPokemonEmbed(pokeData)

        const customIdCatch = `catch_${pokeName}_${Date.now()}`
        const customIdRelease = `release_${pokeName}_${Date.now()}`
        const row = createActionRow(customIdCatch, customIdRelease, !!caught)

        await interaction.reply({
          embeds: [embed],
          components: [row],
          ephemeral: true
        })
      } else {
        return interaction.reply({ content: "Couldn't find that Pokemon.", ephemeral: true })
      }
    } catch (error) {
      console.error(error)
      await interaction.reply({ content: 'An error occurred.', ephemeral: true })
    }
    return
  }
}