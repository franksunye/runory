export type OrganizationRole = "owner" | "admin" | "member";
export type WorkspaceRole = "admin" | "member" | "viewer";
export type DataScope = "all" | "team" | "assigned" | "permitted" | "none";

export interface BusinessRole {
  id: string;
  packId: string;
  packIds?: string[];
  groupKey: string;
  label: string;
  description: string | null;
  permissions: string[];
  assignedUserIds?: string[];
}

export interface AccessResource {
  id: string;
  name: string;
  type: string;
  userId?: string | null;
}

export interface AccessMember {
  userId: string;
  displayName: string;
  email: string | null;
  status: string;
  organizationRole: OrganizationRole | null;
  workspaceRole: WorkspaceRole | null;
  joinedAt: string | null;
  businessRoles: BusinessRole[];
  resources: AccessResource[];
  dataScope: DataScope;
  permissionCount: number;
}

export interface AccessDirectory {
  canManage: boolean;
  workspaceId: string;
  organizationId: string;
  currentUserId: string | null;
  currentOrganizationRole: OrganizationRole | null;
  members: AccessMember[];
  roles: BusinessRole[];
  resources: AccessResource[];
}

export interface AccessInvitation {
  id: string;
  emailNormalized: string;
  emailDisplay: string | null;
  organizationRole: OrganizationRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  workspaceGrants: Array<{
    workspaceId: string;
    workspaceName: string;
    workspaceRole: WorkspaceRole;
  }>;
}
