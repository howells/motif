import { getWorkOS } from "@workos-inc/authkit-nextjs";

/**
 * The owner's invitation actions in WorkOS. Only called after the App's own
 * checks pass (owner role, address not already a member or invited), and
 * only on this server, with the API key AuthKit reads from the environment.
 */
export const sendWorkosInvitation = async (email: string): Promise<string> => {
  const invitation = await getWorkOS().userManagement.sendInvitation({ email });
  return invitation.id;
};

export const revokeWorkosInvitation = async (
  invitationId: string
): Promise<void> => {
  await getWorkOS().userManagement.revokeInvitation(invitationId);
};

export const resendWorkosInvitation = async (
  invitationId: string
): Promise<void> => {
  await getWorkOS().userManagement.resendInvitation(invitationId);
};
