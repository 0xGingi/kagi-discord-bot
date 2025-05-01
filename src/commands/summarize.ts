import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, TextChannel, ChannelType } from 'discord.js';
import { querySummarizer, queryFastGPT } from '../utils/kagiApi';
import axios from 'axios';

export const data = new SlashCommandBuilder()
  .setName('summarize')
  .setDescription('Summarize content using the Kagi Universal Summarizer API')
  .addSubcommand(subcommand =>
    subcommand
      .setName('url')
      .setDescription('Summarize content from a URL')
      .addStringOption(option =>
        option.setName('url')
          .setDescription('The URL to summarize')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('engine')
          .setDescription('Summarization engine to use')
          .setRequired(false)
          .addChoices(
            { name: 'Cecil (Default) - Friendly, descriptive, fast', value: 'cecil' },
            { name: 'Agnes - Formal, technical, analytical', value: 'agnes' },
            { name: 'Muriel - Best-in-class, enterprise-grade', value: 'muriel' }
          )
      )
      .addStringOption(option =>
        option.setName('summary_type')
          .setDescription('Type of summary to generate')
          .setRequired(false)
          .addChoices(
            { name: 'Summary - Paragraph(s) of prose', value: 'summary' },
            { name: 'Takeaway - Bulleted list of key points', value: 'takeaway' }
          )
      )
      .addStringOption(option =>
        option.setName('target_language')
          .setDescription('Target language for the summary')
          .setRequired(false)
          .addChoices(
            { name: 'English', value: 'EN' },
            { name: 'Spanish', value: 'ES' },
            { name: 'French', value: 'FR' },
            { name: 'German', value: 'DE' },
            { name: 'Japanese', value: 'JA' },
            { name: 'Chinese (Simplified)', value: 'ZH' },
            { name: 'Russian', value: 'RU' }
          )
      )
      .addBooleanOption(option =>
        option.setName('cache')
          .setDescription('Whether to allow cached responses (default: true)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('text')
      .setDescription('Summarize provided text')
      .addStringOption(option =>
        option.setName('text')
          .setDescription('The text to summarize')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('engine')
          .setDescription('Summarization engine to use')
          .setRequired(false)
          .addChoices(
            { name: 'Cecil (Default) - Friendly, descriptive, fast', value: 'cecil' },
            { name: 'Agnes - Formal, technical, analytical', value: 'agnes' },
            { name: 'Muriel - Best-in-class, enterprise-grade', value: 'muriel' }
          )
      )
      .addStringOption(option =>
        option.setName('summary_type')
          .setDescription('Type of summary to generate')
          .setRequired(false)
          .addChoices(
            { name: 'Summary - Paragraph(s) of prose', value: 'summary' },
            { name: 'Takeaway - Bulleted list of key points', value: 'takeaway' }
          )
      )
      .addStringOption(option =>
        option.setName('target_language')
          .setDescription('Target language for the summary')
          .setRequired(false)
          .addChoices(
            { name: 'English', value: 'EN' },
            { name: 'Spanish', value: 'ES' },
            { name: 'French', value: 'FR' },
            { name: 'German', value: 'DE' },
            { name: 'Japanese', value: 'JA' },
            { name: 'Chinese (Simplified)', value: 'ZH' },
            { name: 'Russian', value: 'RU' }
          )
      )
      .addBooleanOption(option =>
        option.setName('cache')
          .setDescription('Whether to allow cached responses (default: true)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('channel')
      .setDescription('Summarize recent messages in this channel')
      .addIntegerOption(option =>
        option.setName('messages')
          .setDescription('Number of messages to include (default: 20, max: 100)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(100)
      )
      .addStringOption(option =>
        option.setName('engine')
          .setDescription('Summarization engine to use')
          .setRequired(false)
          .addChoices(
            { name: 'Cecil (Default) - Friendly, descriptive, fast', value: 'cecil' },
            { name: 'Agnes - Formal, technical, analytical', value: 'agnes' },
            { name: 'Muriel - Best-in-class, enterprise-grade', value: 'muriel' }
          )
      )
      .addStringOption(option =>
        option.setName('summary_type')
          .setDescription('Type of summary to generate')
          .setRequired(false)
          .addChoices(
            { name: 'Summary - Paragraph(s) of prose', value: 'summary' },
            { name: 'Takeaway - Bulleted list of key points', value: 'takeaway' }
          )
      )
      .addStringOption(option =>
        option.setName('target_language')
          .setDescription('Target language for the summary')
          .setRequired(false)
          .addChoices(
            { name: 'English', value: 'EN' },
            { name: 'Spanish', value: 'ES' },
            { name: 'French', value: 'FR' },
            { name: 'German', value: 'DE' },
            { name: 'Japanese', value: 'JA' },
            { name: 'Chinese (Simplified)', value: 'ZH' },
            { name: 'Russian', value: 'RU' }
          )
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const subcommand = interaction.options.getSubcommand();
    const engine = interaction.options.getString('engine') || undefined;
    const summaryType = interaction.options.getString('summary_type') || undefined;
    const targetLanguage = interaction.options.getString('target_language') || undefined;
    const cache = interaction.options.getBoolean('cache') ?? undefined;

    let params: any = {
      engine,
      summary_type: summaryType,
      target_language: targetLanguage,
      cache
    };

    if (subcommand === 'url') {
      const url = interaction.options.getString('url');
      if (!url) {
        await interaction.editReply('URL is required');
        return;
      }
      params.url = url;
      
      if (engine === 'muriel') {
        await interaction.followUp({
          content: 'Note: The Muriel engine costs $1 USD per summary, regardless of length.',
          ephemeral: true
        });
      }

      const response = await querySummarizer(params);
      const { output, tokens } = response.data;

      const embed = new EmbedBuilder()
        .setColor(0x8855FF)
        .setTitle(`URL Summary`)
        .setDescription(output)
        .addFields(
          { name: 'Engine', value: engine || 'cecil (default)', inline: true },
          { name: 'Summary Type', value: summaryType || 'summary (default)', inline: true },
          { name: 'Tokens Processed', value: tokens.toString(), inline: true }
        )
        .setTimestamp()
        .setURL(params.url);

      if (targetLanguage) {
        embed.addFields({ name: 'Target Language', value: targetLanguage, inline: true });
      }

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === 'text') {
      const text = interaction.options.getString('text');
      if (!text) {
        await interaction.editReply('Text is required');
        return;
      }
      params.text = text;
      
      if (engine === 'muriel') {
        await interaction.followUp({
          content: 'Note: The Muriel engine costs $1 USD per summary, regardless of length.',
          ephemeral: true
        });
      }

      const response = await querySummarizer(params);
      const { output, tokens } = response.data;

      const embed = new EmbedBuilder()
        .setColor(0x8855FF)
        .setTitle(`Text Summary`)
        .setDescription(output)
        .addFields(
          { name: 'Engine', value: engine || 'cecil (default)', inline: true },
          { name: 'Summary Type', value: summaryType || 'summary (default)', inline: true },
          { name: 'Tokens Processed', value: tokens.toString(), inline: true }
        )
        .setTimestamp();

      if (targetLanguage) {
        embed.addFields({ name: 'Target Language', value: targetLanguage, inline: true });
      }

      await interaction.editReply({ embeds: [embed] });
    } else if (subcommand === 'channel') {
      if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
        await interaction.editReply('This command can only be used in text channels');
        return;
      }

      const textChannel = interaction.channel as TextChannel;
      const messageLimit = interaction.options.getInteger('messages') || 20;
      
      const messages = await textChannel.messages.fetch({ limit: messageLimit });
      
      if (messages.size === 0) {
        await interaction.editReply('No messages found to summarize');
        return;
      }
      
      const messageArray = Array.from(messages.values()).reverse();
      
      const formattedMessages = messageArray.map(msg => {
        const author = msg.author.bot ? `${msg.author.username} (Bot)` : msg.author.username;
        return `${author}: ${msg.content}`;
      }).filter(msg => msg.split(': ')[1].trim() !== '');
      
      if (formattedMessages.length === 0) {
        await interaction.editReply('No messages with text content found to summarize');
        return;
      }
      
      const messageText = formattedMessages.join('\n');
      
      if (engine === 'muriel') {
        await interaction.followUp({
          content: 'Note: The Muriel engine costs $1 USD per summary, regardless of length.',
          ephemeral: true
        });
      }
      
      if (messageText.length <= 10000) {
        params.text = messageText;
        const response = await querySummarizer(params);
        const { output, tokens } = response.data;
        
        const embed = new EmbedBuilder()
          .setColor(0x8855FF)
          .setTitle(`Channel Summary`)
          .setDescription(output)
          .addFields(
            { name: 'Engine', value: engine || 'cecil (default)', inline: true },
            { name: 'Summary Type', value: summaryType || 'summary (default)', inline: true },
            { name: 'Messages Analyzed', value: formattedMessages.length.toString(), inline: true },
            { name: 'Tokens Processed', value: tokens.toString(), inline: true }
          )
          .setTimestamp();
        
        if (targetLanguage) {
          embed.addFields({ name: 'Target Language', value: targetLanguage, inline: true });
        }
        
        await interaction.editReply({ embeds: [embed] });
      } else {
        const query = `Summarize the following chat conversation:\n\n${messageText}`;
        const response = await queryFastGPT({
          query,
          web_search: false,
          cache: false
        });
        
        const { output, tokens } = response.data;
        
        const embed = new EmbedBuilder()
          .setColor(0x8855FF)
          .setTitle(`Channel Summary (FastGPT)`)
          .setDescription(output)
          .addFields(
            { name: 'Messages Analyzed', value: formattedMessages.length.toString(), inline: true },
            { name: 'Tokens Processed', value: tokens.toString(), inline: true }
          )
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
      }
    }
  } catch (error: unknown) {
    console.error('Error in summarize command:', error);
    
    let errorMessage = 'An error occurred while querying the Kagi API.';
    
    if (axios.isAxiosError(error) && error.response?.data?.detail) {
      errorMessage += ` Error: ${error.response.data.detail}`;
    } else if (error instanceof Error) {
      errorMessage += ` Error: ${error.message}`;
    }
    
    await interaction.editReply(errorMessage);
  }
} 