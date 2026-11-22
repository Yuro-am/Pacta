export type Person = { id: string; name: string };
export type Friend = Person & { accepted: boolean; incoming: boolean; username?: string | null };
export type SocialGroup = {
  id: string;
  name: string;
  accepted: boolean;
  owner: boolean;
  members: Person[];
};
export type SocialData = { friends: Friend[]; groups: SocialGroup[] };
