export type Method = "Dinero" | "Comida" | "Bebida" | "Favor" | "Recompensa";
export type Stage = "Pendiente" | "Propuesta" | "Aceptada" | "Saldada";

export type Debt = {
  id: string;
  title: string;
  friend: string;
  group: string;
  amount: number;
  direction: "owe" | "owed";
  kind: "food" | "trip" | "drink" | "other";
  date: string;
  stage: Stage;
  shared?: { waiting: boolean; invite?: string; canRespond: boolean };
  offer?: { method: Method; detail: string };
};

export const groups = [
  { name: "Los de siempre", symbol: "pizza", color: "lilac", members: ["Ana", "Marta", "Pablo", "Lucía", "Hugo", "Álex"] },
  { name: "Escapada a Lisboa", symbol: "plane", color: "mint", members: ["Diego", "Sara", "Nico", "Álex"] },
  { name: "Compañeros de piso", symbol: "house", color: "peach", members: ["Clara", "Leo", "Álex"] },
] as const;

export function euros(amount: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(amount);
}
