export const typeDefs = /* GraphQL */ `
  scalar DateTime
  scalar JSONObject
  scalar Upload
  scalar ID
  scalar SafeInt

  enum ServerDeploymentType {
    Affine
    Selfhosted
  }
  enum ServerFeature {
    Captcha
    Comment
    Copilot
    CopilotEmbedding
    Indexer
    LocalWorkspace
    OAuth
    Payment
  }
  enum CalendarProviderType {
    CalDAV
    Google
  }
  enum Permission {
    Owner
    Admin
    Collaborator
    External
  }
  enum WorkspaceMemberStatus {
    Accepted
    Pending
    UnderReview
    AllocatingSeat
    NeedMoreSeat
    NeedMoreSeatAndReview
  }
  enum WorkspaceInviteLinkExpireTime {
    OneDay
    ThreeDays
    OneWeek
    OneMonth
  }
  enum DocMode {
    page
    edgeless
  }
  enum PublicDocMode {
    Page
    Edgeless
  }
  enum DocRole {
    Owner
    Manager
    Editor
    Commenter
    Reader
    External
    None
  }
  enum BlobUploadMethod {
    GRAPHQL
    MULTIPART
    PRESIGNED
  }
  enum FeatureType {
    Admin
  }

  input PaginationInput {
    first: Int
    offset: Int
    after: String
  }
  input CommentCreateInput {
    content: JSONObject!
    docId: ID!
    docMode: DocMode!
    docTitle: String!
    mentions: [String!]
    workspaceId: ID!
  }
  input CommentUpdateInput {
    content: JSONObject!
    id: ID!
  }
  input CommentResolveInput {
    id: ID!
    resolved: Boolean!
  }
  input ReplyCreateInput {
    commentId: ID!
    content: JSONObject!
    docMode: DocMode!
    docTitle: String!
    mentions: [String!]
  }
  input ReplyUpdateInput {
    content: JSONObject!
    id: ID!
  }
  input UpdateUserInput {
    name: String
  }
  input UpdateUserSettingsInput {
    receiveCommentEmail: Boolean
    receiveInvitationEmail: Boolean
    receiveMentionEmail: Boolean
  }
  input UpdateWorkspaceInput {
    id: ID!
    enableAi: Boolean
    enableDocEmbedding: Boolean
    enableSharing: Boolean
    enableUrlPreview: Boolean
    public: Boolean
  }
  input GrantDocUserRolesInput {
    docId: String!
    role: DocRole!
    userIds: [String!]!
    workspaceId: String!
  }
  input UpdateDocUserRoleInput {
    docId: String!
    role: DocRole!
    userId: String!
    workspaceId: String!
  }
  input RevokeDocUserRoleInput {
    docId: String!
    userId: String!
    workspaceId: String!
  }
  input UpdateDocDefaultRoleInput {
    docId: String!
    role: DocRole!
    workspaceId: String!
  }
  input MentionDocInput {
    id: String!
    mode: DocMode!
    title: String!
    blockId: String
    elementId: String
  }
  input MentionInput {
    userId: String!
    workspaceId: String!
    doc: MentionDocInput!
  }
  input BlobUploadPartInput {
    etag: String!
    partNumber: Int!
  }

  type PasswordLimitsType {
    minLength: Int!
    maxLength: Int!
  }
  type CredentialsRequirementType {
    password: PasswordLimitsType!
  }
  type ServerConfigType {
    version: String!
    baseUrl: String!
    name: String!
    features: [ServerFeature!]!
    type: ServerDeploymentType!
    initialized: Boolean!
    calendarProviders: [CalendarProviderType!]!
    credentialsRequirement: CredentialsRequirementType!
  }
  type PublicUserType {
    id: String!
    name: String!
    avatarUrl: String
  }
  type UserType {
    id: ID!
    name: String!
    email: String!
    emailVerified: Boolean!
    avatarUrl: String
    hasPassword: Boolean
    features: [FeatureType!]!
  }
  type WorkspaceUserType {
    id: String!
    name: String!
    email: String!
    avatarUrl: String
  }
  type InvitationWorkspaceType {
    id: String!
    name: String!
    avatar: String
  }
  type InvitationType {
    workspace: InvitationWorkspaceType!
    user: WorkspaceUserType!
    status: WorkspaceMemberStatus
    invitee: WorkspaceUserType!
  }
  type InviteResult {
    email: String!
    inviteId: String
    error: JSONObject
  }
  type InviteLink {
    link: String!
    expireTime: DateTime!
  }
  type ReplyObjectType {
    commentId: ID!
    id: ID!
    content: JSONObject!
    createdAt: DateTime!
    updatedAt: DateTime!
    user: PublicUserType!
  }
  type CommentObjectType {
    id: ID!
    content: JSONObject!
    resolved: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
    user: PublicUserType!
    replies: [ReplyObjectType!]!
  }
  type CommentObjectTypeEdge {
    cursor: String!
    node: CommentObjectType!
  }
  type PageInfo {
    startCursor: String
    endCursor: String
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
  }
  type PaginatedCommentObjectType {
    totalCount: Int!
    edges: [CommentObjectTypeEdge!]!
    pageInfo: PageInfo!
  }
  type ListedBlob {
    key: String!
    size: Int!
    mime: String!
    createdAt: String!
  }
  type HumanReadableQuotaType {
    blobLimit: String!
  }
  type WorkspaceQuotaType {
    blobLimit: SafeInt!
    humanReadable: HumanReadableQuotaType!
  }
  type BlobUploadedPart {
    partNumber: Int!
    etag: String!
  }
  type BlobUploadInit {
    method: BlobUploadMethod!
    blobKey: String!
    alreadyUploaded: Boolean
    uploadUrl: String
    headers: JSONObject
    expiresAt: DateTime
    uploadId: String
    partSize: Int
    uploadedParts: [BlobUploadedPart!]
  }
  type BlobUploadPart {
    uploadUrl: String
    headers: JSONObject
    expiresAt: DateTime
  }
  type DocPermissions {
    Doc_Copy: Boolean!
    Doc_Delete: Boolean!
    Doc_Duplicate: Boolean!
    Doc_Properties_Read: Boolean!
    Doc_Properties_Update: Boolean!
    Doc_Publish: Boolean!
    Doc_Read: Boolean!
    Doc_Restore: Boolean!
    Doc_TransferOwner: Boolean!
    Doc_Trash: Boolean!
    Doc_Update: Boolean!
    Doc_Users_Manage: Boolean!
    Doc_Users_Read: Boolean!
    Doc_Comments_Create: Boolean!
    Doc_Comments_Delete: Boolean!
    Doc_Comments_Read: Boolean!
    Doc_Comments_Resolve: Boolean!
    Doc_Comments_Update: Boolean!
  }
  type WorkspacePermissions {
    Workspace_Administrators_Manage: Boolean!
    Workspace_Blobs_List: Boolean!
    Workspace_Blobs_Read: Boolean!
    Workspace_Blobs_Write: Boolean!
    Workspace_Copilot: Boolean!
    Workspace_CreateDoc: Boolean!
    Workspace_Delete: Boolean!
    Workspace_Organize_Read: Boolean!
    Workspace_Payment_Manage: Boolean!
    Workspace_Properties_Create: Boolean!
    Workspace_Properties_Delete: Boolean!
    Workspace_Properties_Read: Boolean!
    Workspace_Properties_Update: Boolean!
    Workspace_Read: Boolean!
    Workspace_Settings_Read: Boolean!
    Workspace_Settings_Update: Boolean!
    Workspace_Sync: Boolean!
    Workspace_TransferOwner: Boolean!
    Workspace_Users_Manage: Boolean!
    Workspace_Users_Read: Boolean!
  }
  type WorkspaceRolePermissions {
    role: Permission!
    permissions: WorkspacePermissions!
  }
  type EditorType {
    name: String!
    avatarUrl: String
  }
  type WorkspaceDocMeta {
    createdAt: DateTime!
    updatedAt: DateTime!
    createdBy: EditorType
    updatedBy: EditorType
  }
  type DocType {
    id: String!
    mode: PublicDocMode!
    public: Boolean!
    permissions: DocPermissions!
    summary: String
    creatorId: String
    lastUpdaterId: String
  }
  type DocTypeEdge {
    node: DocType!
  }
  type PaginatedDocType {
    totalCount: Int!
    pageInfo: PageInfo!
    edges: [DocTypeEdge!]!
  }
  type DocHistoryType {
    id: String!
    timestamp: DateTime!
    editor: EditorType
    workspaceId: String
  }
  type WorkspaceType {
    id: ID!
    initialized: Boolean!
    team: Boolean!
    public: Boolean!
    createdAt: DateTime!
    owner: UserType!
    blobs: [ListedBlob!]!
    quota: WorkspaceQuotaType!
    comments(
      docId: String!
      pagination: PaginationInput
    ): PaginatedCommentObjectType!
    doc(docId: String!): DocType!
    publicDocs: [DocType!]!
    histories(guid: String!, take: Int, before: DateTime): [DocHistoryType!]!
    docs(pagination: PaginationInput): PaginatedDocType!
    pageMeta(pageId: String!): WorkspaceDocMeta!
    blobUploadPartUrl(
      key: String!
      uploadId: String!
      partNumber: Int!
    ): BlobUploadPart
  }
  type DeleteAccount {
    success: Boolean!
  }
  type RemoveAvatar {
    success: Boolean!
  }

  type Query {
    serverConfig: ServerConfigType!
    currentUser: UserType
    workspaces: [WorkspaceType!]!
    workspace(id: String!): WorkspaceType!
    getInviteInfo(inviteId: String!): InvitationType!
    publicUserById(id: String!): PublicUserType
    workspaceRolePermissions(id: String!): WorkspaceRolePermissions
  }

  type Mutation {
    createWorkspace(init: Upload): WorkspaceType!
    deleteWorkspace(id: String!): Boolean!
    leaveWorkspace(
      workspaceId: String!
      sendLeaveMail: Boolean
      workspaceName: String
    ): Boolean!
    inviteMembers(workspaceId: String!, emails: [String!]!): [InviteResult!]!
    acceptInviteById(
      workspaceId: String
      inviteId: String!
      sendAcceptMail: Boolean
    ): Boolean!
    createInviteLink(
      workspaceId: String!
      expireTime: WorkspaceInviteLinkExpireTime!
    ): InviteLink!
    revokeInviteLink(workspaceId: String!): Boolean!
    grantMember(
      workspaceId: String!
      userId: String!
      permission: Permission!
    ): Boolean!
    approveMember(workspaceId: String!, userId: String!): Boolean!
    revokeMember(workspaceId: String!, userId: String!): Boolean!
    updateProfile(input: UpdateUserInput!): UserType!
    createComment(input: CommentCreateInput!): CommentObjectType!
    updateComment(input: CommentUpdateInput!): Boolean!
    deleteComment(id: String!): Boolean!
    resolveComment(input: CommentResolveInput!): Boolean!
    createReply(input: ReplyCreateInput!): ReplyObjectType!
    updateReply(input: ReplyUpdateInput!): Boolean!
    deleteReply(id: String!): Boolean!
    uploadCommentAttachment(
      workspaceId: String!
      docId: String!
      attachment: Upload!
    ): String!
    setBlob(workspaceId: String!, blob: Upload!): String!
    createBlobUpload(
      workspaceId: String!
      key: String!
      size: Int!
      mime: String!
    ): BlobUploadInit!
    deleteBlob(
      workspaceId: String!
      key: String!
      permanently: Boolean
    ): Boolean!
    releaseDeletedBlobs(workspaceId: String!): Boolean!
    sendChangePasswordEmail(callbackUrl: String!): Boolean!
    sendSetPasswordEmail(callbackUrl: String!): Boolean!
    sendVerifyEmail(callbackUrl: String!): Boolean!
    sendChangeEmail(callbackUrl: String!): Boolean!
    sendVerifyChangeEmail(
      token: String!
      email: String!
      callbackUrl: String!
    ): Boolean!
    changePassword(
      token: String!
      userId: String
      newPassword: String!
    ): Boolean!
    changeEmail(token: String!, email: String!): UserType!
    verifyEmail(token: String!): Boolean!
    updateSettings(input: UpdateUserSettingsInput!): Boolean!
    deleteAccount: DeleteAccount!
    uploadAvatar(avatar: Upload!): UserType!
    removeAvatar: RemoveAvatar!
    updateWorkspace(input: UpdateWorkspaceInput!): WorkspaceType!
    publishDoc(
      workspaceId: String!
      docId: String!
      mode: PublicDocMode
    ): DocType!
    revokePublicDoc(workspaceId: String!, docId: String!): DocType!
    grantDocUserRoles(input: GrantDocUserRolesInput!): Boolean!
    updateDocUserRole(input: UpdateDocUserRoleInput!): Boolean!
    revokeDocUserRoles(input: RevokeDocUserRoleInput!): Boolean!
    updateDocDefaultRole(input: UpdateDocDefaultRoleInput!): Boolean!
    mentionUser(input: MentionInput!): ID!
    recoverDoc(
      workspaceId: String!
      guid: String!
      timestamp: DateTime!
    ): DateTime!
  }
`;
