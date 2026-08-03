import { SetMetadata } from '@nestjs/common';
import type { OrgPermissionAction, OrgPermissionResource } from '../auth/permissions';

export const ORG_PERMISSION_METADATA_KEY = 'organization_permission';

export type OrgPermissionRequirement = {
	[Resource in OrgPermissionResource]: {
		resource: Resource;
		action: OrgPermissionAction<Resource>;
	};
}[OrgPermissionResource];

export function RequireOrgPermission<
	Resource extends OrgPermissionResource,
	Action extends OrgPermissionAction<Resource>
>(resource: Resource, action: Action) {
	return SetMetadata(ORG_PERMISSION_METADATA_KEY, { resource, action });
}
