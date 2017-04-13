const winston = require('winston');
const Websocket = require('ws');

const { streamInfo } = require('./config');

module.exports = class WebsocketManager {
	constructor(client) {
		this.client = client;
		this.ws = null;
	}

	connect() {
		if (this.ws) this.ws.removeAllListeners();

		try {
			this.ws = new Websocket(streamInfo);
			winston.info(`[SHARD: ${this.client.shard.id}] WEBSOCKET: Connection A-OK!`);
		} catch (error) {
			winston.error(`[SHARD: ${this.client.shard.id}] WEBSOCKET: Failed to connect! ${error}`);
			setTimeout(this.connect.bind(this), 3000);
		}

		this.ws.on('message', this.onMessage.bind(this));
		this.ws.on('close', this.onClose.bind(this));
		this.ws.on('error', winston.error);

		this.currentUsersAndGuildsGame();
	}

	async onMessage(data) {
		try {
			if (!data) return;

			const discordListeners = (await this.client.shard.broadcastEval(`
				this.voiceConnections
					.map(vc => vc.channel.members.filter(me => !(me.user.bot || me.selfDeaf || me.deaf)).size)
					.reduce((sum, members) => sum + members, 0);
			`)).reduce((prev, next) => prev + next, 0);

			const parsed = JSON.parse(data);
			this.client.radioInfo = {
				songName: parsed.song_name,
				artistName: parsed.artist_name,
				animeName: parsed.anime_name,
				listeners: parsed.listeners,
				requestedBy: parsed.requested_by,
				discordListeners
			};
		} catch (error) {
			winston.error(error);
		}
	}

	onClose() {
		setTimeout(this.connect.bind(this), 3000);
		winston.warn(`[SHARD: ${this.client.shard.id}] WEBSOCKET: Connection closed, reconnecting...`);
	}

	async currentUsersAndGuildsGame() {
		if (!this.client.customStream) {
			try {
				const results = await this.client.shard.fetchClientValues('guilds.size');
				const guildsAmount = results.reduce((prev, next) => prev + next, 0);
				if (this.client.streaming) this.client.user.setGame(`for ${this.client.radioInfo.discordListeners} on ${guildsAmount} servers`, 'https://twitch.tv/listen_moe'); // eslint-disable-line max-len
				else this.client.user.setGame(`for ${this.client.radioInfo.discordListeners} on ${guildsAmount} servers`);
			} catch (error) {
				// Do nothing
			}
		}
		return setTimeout(this.currentSongGame.bind(this), 10000);
	}

	currentSongGame() {
		if (!this.client.customStream) {
			let game = 'Loading data...';
			if (Object.keys(this.client.radioInfo).length) {
				game = `${this.client.radioInfo.artistName} - ${this.client.radioInfo.songName}`;
			}
			if (this.client.streaming) this.client.user.setGame(game, 'https://twitch.tv/listen_moe');
			else this.client.user.setGame(game);
		}
		return setTimeout(this.currentUsersAndGuildsGame.bind(this), 20000);
	}
};
