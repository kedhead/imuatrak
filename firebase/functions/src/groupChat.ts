/**
 * Validation for member-created group chats (see createGroupChat /
 * updateGroupChat in index.ts). Pure, so it can be unit-tested from the app's
 * Jest without Firebase.
 *
 * A group chat is a dms/{threadId} doc with `isGroup: true` and more than two
 * participants. It deliberately reuses the DM rules: only participants can
 * read it, and there is no owner/admin bypass — club staff see a group only
 * if they've been added to it.
 */
export const GROUP_NAME_MAX = 50;
/** Including the creator. Keeps the push fan-out and roster reads bounded. */
export const GROUP_MAX_MEMBERS = 50;

export class GroupChatInputError extends Error {}

export function normalizeGroupName(name: unknown): string {
  if (typeof name !== "string") throw new GroupChatInputError("Give the group a name");
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (!trimmed) throw new GroupChatInputError("Give the group a name");
  if (trimmed.length > GROUP_NAME_MAX) {
    throw new GroupChatInputError(`Keep the name under ${GROUP_NAME_MAX} characters`);
  }
  return trimmed;
}

/**
 * The uids to put in a new group alongside the caller: deduped, without the
 * caller, at least two others (one other person is a DM), and within the cap.
 */
export function normalizeNewGroupMembers(callerUid: string, uids: unknown): string[] {
  if (!Array.isArray(uids) || uids.some((u) => typeof u !== "string" || !u)) {
    throw new GroupChatInputError("Pick who to add");
  }
  const others = [...new Set(uids as string[])].filter((u) => u !== callerUid);
  if (others.length < 2) {
    throw new GroupChatInputError("A group needs at least two other people. For one person, send a direct message.");
  }
  if (others.length + 1 > GROUP_MAX_MEMBERS) {
    throw new GroupChatInputError(`Groups can have up to ${GROUP_MAX_MEMBERS} people`);
  }
  return others;
}

/** People to add to an existing group: new ones only, within the cap. */
export function normalizeAddedMembers(current: string[], uids: unknown): string[] {
  if (!Array.isArray(uids) || uids.some((u) => typeof u !== "string" || !u)) {
    throw new GroupChatInputError("Pick who to add");
  }
  const toAdd = [...new Set(uids as string[])].filter((u) => !current.includes(u));
  if (toAdd.length === 0) throw new GroupChatInputError("They're already in the group");
  if (current.length + toAdd.length > GROUP_MAX_MEMBERS) {
    throw new GroupChatInputError(`Groups can have up to ${GROUP_MAX_MEMBERS} people`);
  }
  return toAdd;
}

/** "Sat carpool" / "Kai: who's driving?" for a group push. */
export function groupPushText(groupName: string, authorName: string, body: string) {
  return { title: groupName, body: `${authorName}: ${body}` };
}
