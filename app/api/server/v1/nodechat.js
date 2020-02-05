import { Meteor } from 'meteor/meteor';
import { DDPCommon } from 'meteor/ddp-common';
import { DDP } from 'meteor/ddp';
import { Accounts } from 'meteor/accounts-base';
import { Restivus } from 'meteor/nimble:restivus';
import { RateLimiter } from 'meteor/rate-limit';
import _ from 'underscore';

import { Logger } from '../../logger';
import { settings } from '../../settings';
import { metrics } from '../../metrics';
import { hasPermission, hasAllPermission } from '../../../authorization';
import { getDefaultUserFields } from '../../utils/server/functions/getDefaultUserFields';

import { API } from '../api';

API.v1.addRoute('nodechat.login', { authRequired: false }, {
	post() {

		check(this.bodyParams, {
			qr: String,
		});

		const args = loginCompatibility(this.bodyParams);
		const getUserInfo = self.getHelperMethod('getUserInfo');

		const invocation = new DDPCommon.MethodInvocation({
			connection: {
				close() {},
			},
		});

		let auth;
		try {
			auth = DDP._CurrentInvocation.withValue(invocation, () => Meteor.call('login', args));
		} catch (error) {
			let e = error;
			if (error.reason === 'User not found') {
				e = {
					error: 'Unauthorized',
					reason: 'Unauthorized',
				};
			}

			return {
				statusCode: 401,
				body: {
					status: 'error',
					error: e.error,
					message: e.reason || e.message,
				},
			};
		}

		this.user = Meteor.users.findOne({
			_id: auth.id,
		}, {
			fields: getDefaultUserFields(),
		});

		this.userId = this.user._id;

		const response = {
			status: 'success',
			qr: this.bodyParams.qr,
			data: {
				userId: this.userId,
				authToken: auth.token,
				me: getUserInfo(this.user),
			},
		};

		const extraData = self._config.onLoggedIn && self._config.onLoggedIn.call(this);

		if (extraData != null) {
			_.extend(response.data, {
				extra: extraData,
			});
		}

		return response;
	},
});
