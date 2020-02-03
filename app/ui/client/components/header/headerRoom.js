import toastr from 'toastr';
import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Session } from 'meteor/session';
import { Template } from 'meteor/templating';
import { FlowRouter } from 'meteor/kadira:flow-router';

import { t, roomTypes, handleError } from '../../../../utils';
import { TabBar, fireGlobalEvent, call } from '../../../../ui-utils';
import { ChatSubscription, Rooms, ChatRoom } from '../../../../models';
import { settings } from '../../../../settings';
import { emoji } from '../../../../emoji';
import { Markdown } from '../../../../markdown/client';
import { hasAllPermission } from '../../../../authorization';

const isSubscribed = (_id) => ChatSubscription.find({ rid: _id }).count() > 0;

const favoritesEnabled = () => settings.get('Favorite_Rooms');

const isDiscussion = ({ _id }) => {
	const room = ChatRoom.findOne({ _id });
	return !!(room && room.prid);
};

const getUserStatus = (id) => {
	const roomData = Session.get(`roomData${ id }`);
	return roomTypes.getUserStatus(roomData.t, id);
};

const getUserStatusText = (id) => {
	const roomData = Session.get(`roomData${ id }`);
	return roomTypes.getUserStatusText(roomData.t, id);
};

Template.headerRoom.helpers({
	back() {
		return Template.instance().data.back;
	},
	avatarBackground() {
		const roomData = Session.get(`roomData${ this._id }`);
		if (!roomData) { return ''; }
		return roomTypes.getSecondaryRoomName(roomData.t, roomData) || roomTypes.getRoomName(roomData.t, roomData);
	},
	buttons() {
		return TabBar.getButtons();
	},

	isDiscussion() {
		return isDiscussion(Template.instance().data);
	},

	isTranslated() {
		const sub = ChatSubscription.findOne({ rid: this._id }, { fields: { autoTranslate: 1, autoTranslateLanguage: 1 } });
		return settings.get('AutoTranslate_Enabled') && ((sub != null ? sub.autoTranslate : undefined) === true) && (sub.autoTranslateLanguage != null);
	},

	state() {
		const sub = ChatSubscription.findOne({ rid: this._id }, { fields: { f: 1 } });
		if (((sub != null ? sub.f : undefined) != null) && sub.f && favoritesEnabled()) { return ' favorite-room'; }
		return 'empty';
	},

	favoriteLabel() {
		const sub = ChatSubscription.findOne({ rid: this._id }, { fields: { f: 1 } });
		if (((sub != null ? sub.f : undefined) != null) && sub.f && favoritesEnabled()) { return 'Unfavorite'; }
		return 'Favorite';
	},

	isDirect() {
		return Rooms.findOne(this._id).t === 'd';
	},

	roomName() {
		const roomData = Session.get(`roomData${ this._id }`);
		if (!roomData) { return ''; }

		return roomTypes.getRoomName(roomData.t, roomData);
	},

	secondaryName() {
		const roomData = Session.get(`roomData${ this._id }`);
		if (!roomData) { return ''; }

		return roomTypes.getSecondaryRoomName(roomData.t, roomData);
	},

	roomTopic() {
		const roomData = Session.get(`roomData${ this._id }`);
		if (!roomData || !roomData.topic) { return ''; }

		let roomTopic = Markdown.parse(roomData.topic.replace(/\n/mg, ' '));

		// &#39; to apostrophe (') for emojis such as :')
		roomTopic = roomTopic.replace(/&#39;/g, '\'');

		roomTopic = Object.keys(emoji.packages).reduce((topic, emojiPackage) => emoji.packages[emojiPackage].render(topic), roomTopic);

		// apostrophe (') back to &#39;
		return roomTopic.replace(/\'/g, '&#39;');
	},

	roomIcon() {
		const roomData = Session.get(`roomData${ this._id }`);
		if (!(roomData != null ? roomData.t : undefined)) { return ''; }

		return roomTypes.getIcon(roomData);
	},

	tokenAccessChannel() {
		return Template.instance().hasTokenpass.get();
	},
	encryptionState() {
		const room = ChatRoom.findOne(this._id);
		return settings.get('E2E_Enable') && room && room.encrypted && 'encrypted';
	},

	userStatus() {
		return getUserStatus(this._id) || 'offline';
	},

	userStatusText() {
		const statusText = getUserStatusText(this._id);
		if (statusText) {
			return statusText;
		}

		const presence = getUserStatus(this._id);
		if (presence) {
			return t(presence);
		}

		const oldStatusText = Template.instance().userOldStatusText.get();
		if (oldStatusText) {
			return oldStatusText;
		}

		return t('offline');
	},

	showToggleFavorite() {
		return !isDiscussion(Template.instance().data) && isSubscribed(this._id) && favoritesEnabled();
	},

	fixedHeight() {
		return Template.instance().data.fixedHeight;
	},

	fullpage() {
		return Template.instance().data.fullpage;
	},

	isChannel() {
		return Template.instance().currentChannel != null;
	},

	isSection() {
		return Template.instance().data.sectionName != null;
	},
});

Template.headerRoom.events({
	'click .iframe-toolbar .js-iframe-action'(e) {
		fireGlobalEvent('click-toolbar-button', { id: this.id });
		e.currentTarget.querySelector('button').blur();
		return false;
	},

	'click .rc-header__toggle-favorite'(event) {
		event.stopPropagation();
		event.preventDefault();
		return Meteor.call(
			'toggleFavorite',
			this._id,
			!$(event.currentTarget).hasClass('favorite-room'),
			(err) => err && handleError(err)
		);
	},

	'click .js-open-parent-channel'(event, t) {
		event.preventDefault();
		const { prid } = t.currentChannel;
		FlowRouter.goToRoomById(prid);
	},
	'click .js-toggle-encryption'(event) {
		event.stopPropagation();
		event.preventDefault();
		const room = ChatRoom.findOne(this._id);
		if (hasAllPermission('edit-room', this._id)) {
			call('saveRoomSettings', this._id, 'encrypted', !(room && room.encrypted)).then(() => {
				toastr.success(
					t('Encrypted_setting_changed_successfully')
				);
			});
		}
	},
});

const loadUserStatusText = () => {
	const instance = Template.instance();

	if (!instance || !instance.data || !instance.data._id) {
		return;
	}

	const id = instance.data._id;

	if (Rooms.findOne(id).t !== 'd') {
		return;
	}

	const userId = id.replace(Meteor.userId(), '');

	// If the user is already on the local collection, the method call is not necessary
	const found = Meteor.users.findOne(userId, { fields: { _id: 1 } });
	if (found) {
		return;
	}

	Meteor.call('getUserStatusText', userId, (error, result) => {
		if (!error) {
			instance.userOldStatusText.set(result);
		}
	});
};

Template.headerRoom.onCreated(function() {
	this.currentChannel = (this.data && this.data._id && Rooms.findOne(this.data._id)) || undefined;

	this.hasTokenpass = new ReactiveVar(false);
	this.userOldStatusText = new ReactiveVar(null);

	if (settings.get('API_Tokenpass_URL') !== '') {
		Meteor.call('getChannelTokenpass', this.data._id, (error, result) => {
			if (!error) {
				this.hasTokenpass.set(!!(result && result.tokens && result.tokens.length > 0));
			}
		});
	}

	loadUserStatusText();
});
