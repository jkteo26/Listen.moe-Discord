global.Promise = require('bluebird');

const { CommandoClient, FriendlyError, SQLiteProvider } = require('discord.js-commando');
const { oneLine, stripIndents } = require('common-tags');
const https = require('https');
const path = require('path');
const sqlite = require('sqlite');
const request = require('superagent');
const winston = require('winston');

const { owners, stream, twitchClientID } = require('./config');
const VoiceManager = require('./VoiceManager');
const WebsocketManager = require('./WebsocketManager');

const client = new CommandoClient({
	owner: owners,
	commandPrefix: '~~',
	unknownCommandResponse: false,
	disableEveryone: true
});

function getStream() {
	return new Promise(resolve => https.get(stream, res => resolve(res))
		.on('error', () => process.exit(1)));
}

getStream().then(res => {
	const broadcast = client.createVoiceBroadcast();
	broadcast.playStream(res)
		.on('error', err => {
			winston.error(`[SHARD: ${client.shard.id}] PLAYSTREAM ERROR VOICE CONNECTION: ${err.stack}`);
		});

	client.voiceManager = new VoiceManager(client, broadcast);
	client.voiceManager.setupGuilds();
});

const streamCheck = setInterval(() => { // eslint-disable-line no-unused-vars
	request
		.get('https://api.twitch.tv/kraken/streams/?limit=1&channel=listen_moe')
		.set('Accept', 'application/vnd.twitchtv.v3+json')
		.set('Client-ID', twitchClientID)
		.end((err, res) => {
			if (err || !res.streams) client.streaming = false;
			else client.streaming = true;
		});
}, 30000);

client.dispatcher.addInhibitor(msg => {
	const ignoredChannels = client.provider.get('global', 'ignoredChannels', []);
	return ignoredChannels.includes(msg.channel.id);
});

client.setProvider(sqlite.open(path.join(__dirname, 'settings.db')).then(db => new SQLiteProvider(db)));

client.websocketManager = new WebsocketManager(client);

client.on('error', winston.error)
	.on('warn', winston.warn)
	.once('ready', () => {
		client.websocketManager.connect();
	})
	.on('ready', () => {
		winston.info(oneLine`
			Client ready...
			Logged in as ${client.user.tag}
			(${client.user.id})
		`);
	})
	.on('guildCreate', guild => {
		/* eslint-disable max-len */
		guild.defaultChannel.sendEmbed({
			description: stripIndents`**LISTEN.moe discord bot by Crawl, vzwGrey, Anon & Kana**
				**Usage:**
				After adding me to your server, join a voice channel and type \`~~join\` to bind me to that voice channel.
				Keep in mind that you need to have the \`Manage Server\` permission to use this command.
				**Commands:**
				**\\~~join**: Type this while in a voice channel to have the bot join that channel and start playing there. Limited to users with the "manage server" permission.
				**\\~~leave**: Makes the bot leave the voice channel it's currently in.
				**\\~~np**: Gets the currently playing song and artist. If the song was requested by someone, also gives their name.
				**\\~~ignore**: Ignores commands in the current channel. Admin commands are exempt from the ignore.
				**\\~~unignore**: Unignores commands in the current channel.
				**\\~~ignore all**: Ignores commands in all channels on the guild.
				**\\~~unignore all**: Unignores all channels on the guild.
				**\\~~prefix !** Changes the bot's prefix for this server. Prefixes cannot contain whitespace, letters, or numbers - anything else is fair game. It's recommended that you stick with the default prefix of ~~, but this command is provided in case you find conflicts with other bots.
				For additional commands and help, please visit [Github](https://github.com/WeebDev/listen.moe-discord)`,
			color: 15473237
		});
		/* eslint-enable max-len */
	})
	.on('guildDelete', guild => client.provider.clear(guild.id))
	.on('disconnect', () => winston.warn('Disconnected!'))
	.on('reconnect', () => winston.warn('Reconnecting...'))
	.on('commandRun', (cmd, promise, msg, args) => {
		winston.info(oneLine`${msg.author.tag} (${msg.author.id})
			> ${msg.guild ? `${msg.guild.name} (${msg.guild.id})` : 'DM'}
			>> ${cmd.groupID}:${cmd.memberName}
			${Object.values(args)[0] !== '' || [] ? `>>> ${Object.values(args)}` : ''}
		`);
	})
	.on('commandError', (cmd, err) => {
		if (err instanceof FriendlyError) return;
		winston.error(`Error in command ${cmd.groupID}:${cmd.memberName}`, err);
	})
	.on('commandBlocked', (msg, reason) => {
		winston.info(oneLine`
			Command ${msg.command ? `${msg.command.groupID}:${msg.command.memberName}` : ''}
			blocked; User ${msg.author.tag} (${msg.author.id}): ${reason}
		`);
	})
	.on('commandPrefixChange', (guild, prefix) => {
		winston.info(oneLine`
			Prefix changed to ${prefix || 'the default'}
			${guild ? `in guild ${guild.name} (${guild.id})` : 'globally'}.
		`);
	})
	.on('commandStatusChange', (guild, command, enabled) => {
		winston.info(oneLine`
			Command ${command.groupID}:${command.memberName}
			${enabled ? 'enabled' : 'disabled'}
			${guild ? `in guild ${guild.name} (${guild.id})` : 'globally'}.
		`);
	})
	.on('groupStatusChange', (guild, group, enabled) => {
		winston.info(oneLine`
			Group ${group.id}
			${enabled ? 'enabled' : 'disabled'}
			${guild ? `in guild ${guild.name} (${guild.id})` : 'globally'}.
		`);
	});

client.registry
	.registerGroups([
		['listen', 'Listen.moe'],
		['util', 'Utility']
	])
	.registerDefaults()
	.registerCommandsIn(path.join(__dirname, 'commands'));

client.login();
