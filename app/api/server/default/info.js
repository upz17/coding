import { hasRole } from '../../../authorization';
import { Info } from '../../../utils';
import { API } from '../api';

API.default.addRoute('info', { authRequired: false }, {
	get() {
		const user = this.getLoggedInUser();

		if (user && hasRole(user._id, 'admin')) {
			return API.v1.success({
				info: Info,
				info2: Info,
				info3: Info,
			});
		}

		return API.v1.success({
			version: Info.version,
			version2: Info.version,
			version3: Info.version,
		});
	},
});
