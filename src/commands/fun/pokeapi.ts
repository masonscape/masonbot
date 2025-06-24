import { ChatInputCommandInteraction, ColorResolvable, EmbedBuilder, SlashCommandBuilder } from 'discord.js'
import axios from 'axios'

const getPokemonInfo = async (pokemon: string) => {
  try {
    const response = await axios.get(`https://pokeapi.co/api/v2/pokemon/${pokemon}`)
    return response.data
  } catch (error) {
    console.error(`Error fetching Pokémon: ${pokemon}`, error)
    throw error
  }
}

const getPokemonSpeciesInfo = async (pokemon: string) => {
    try {
    const response = await axios.get(`https://pokeapi.co/api/v2/pokemon-species/${pokemon}`)
    return response.data
  } catch (error) {
    console.error(`Error fetching Pokémon: ${pokemon}`, error)
    throw error
  }
}

export const data = new SlashCommandBuilder()
  .setName('pkmn')
  .setDescription('Search for a Pokemon using PokeAPI')
  .setContexts(0, 1, 2)
  .setIntegrationTypes(1)
  .addStringOption(option => 
    option.setName('name')
      .setDescription('The Pokemon to search'))

const typeColors: Record<string, [ColorResolvable, string]> = {
  "normal": ["#A8A77A", "⚪"],
  "fire": ["#EE8130", "🔥"],
  "water": ["#6390F0", "💧"],
  "electric": ["#F7D02C", "⚡"],
  "grass": ["#7AC74C", "🍃"],
  "ice": ["#96D9D6", "❄️"],
  "fighting": ["#C22E28", "🥊"],
  "poison": ["#A33EA1", "☠️"],
  "ground": ["#E2BF65", "🌍"],
  "flying": ["#A98FF3", "🕊️"],
  "psychic": ["#F95587", "🔮"],
  "bug": ["#A6B91A", "🐛"],
  "rock": ["#B6A136", "🪨"],
  "ghost": ["#735797", "👻"],
  "dragon": ["#6F35FC", "🐉"],
  "dark": ["#705746", "🌑"],
  "steel": ["#B7B7CE", "⚙️"],
  "fairy": ["#D685AD", "✨"]
}

const capitalizeFirstLetter = (word: string) => {
  const firstLetter = word.split("").shift()
  const restOfWord = word.slice(1, word.length)
  return firstLetter?.toUpperCase() + restOfWord
}

const formatGeneration = (gen: string) => {
  const genNumber = gen.split("-")[1]
  return 'Generation ' + genNumber.toUpperCase()
}
  
const createPokemonEmbed = (pokemonData: any, speciesData: any) => {

  const embed = new EmbedBuilder()
    .setTitle(`${capitalizeFirstLetter(pokemonData.name)} (#${pokemonData.id})`)
    .setColor(typeColors[pokemonData.types[0].type.name][0])
    .addFields([
      {
        name: pokemonData.types.length === 1 ? "Type" : "Types",
        value: pokemonData.types.map((type: any) => typeColors[type.type.name][1] + " " + capitalizeFirstLetter(type.type.name)).join(" "),
        inline: true
      },
      {
        name: pokemonData.abilities === 1 ? "Ability" : "Abilities",
        value: pokemonData.abilities.map((ability: any) => capitalizeFirstLetter(ability.ability.name)).join(", "),
        inline: true
      }
    ])
    .setImage(pokemonData.sprites.other['official-artwork'].front_default)
    .setFooter({
      text: formatGeneration(speciesData.generation.name)
    })
  

  return embed
}

/*

ok new idea: i wanna make it so that if a pokemon has evolutions, you will have buttons at the bottom to page through said evolutions. so if you do the command and input lets say ivysaur, there will be a button with a back button button, and if you click it it will bring up bulbasaur. or you can press the forward button and it will bring up venusaur. and then once youre on venusaur, the forward button is disabled because venusaur has no evo

*/

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply()

  let pokemonName = interaction.options.getString('name')
  
  if (!pokemonName) {
    pokemonName = Math.ceil(Math.random() * 1025).toString()
  }

  try {
    const pokemonInfo = await getPokemonInfo(pokemonName)
    const speciesInfo = await getPokemonSpeciesInfo(pokemonName)

    interaction.editReply({
      embeds: [createPokemonEmbed(pokemonInfo, speciesInfo)]
    })
  } catch (error) {
    console.error(error)
    await interaction.editReply('An error occurred.')
  }
}