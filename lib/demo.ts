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
  offer?: { method: Method; detail: string };
};

export const groups = [
  { name: "Los de siempre", symbol: "pizza", color: "lilac", members: ["Ana", "Marta", "Pablo", "Lucía", "Hugo", "Álex"] },
  { name: "Escapada a Lisboa", symbol: "plane", color: "mint", members: ["Diego", "Sara", "Nico", "Álex"] },
  { name: "Compañeros de piso", symbol: "house", color: "peach", members: ["Clara", "Leo", "Álex"] },
] as const;

export const sample: Debt[] = [
  { id: "1", title: "Cena del viernes", friend: "Ana", group: groups[0].name, amount: 24.5, direction: "owed", kind: "food", date: "Hoy", stage: "Pendiente" },
  { id: "2", title: "Airbnb en Lisboa", friend: "Diego", group: groups[1].name, amount: 38, direction: "owe", kind: "trip", date: "Ayer", stage: "Pendiente" },
  { id: "3", title: "Café y brunch", friend: "Marta", group: groups[0].name, amount: 12, direction: "owed", kind: "drink", date: "18 jun", stage: "Propuesta", offer: { method: "Bebida", detail: "Te invito a dos cafés la próxima vez." } },
  { id: "4", title: "Compra del súper", friend: "Clara", group: groups[2].name, amount: 8.5, direction: "owe", kind: "other", date: "16 jun", stage: "Pendiente" },
  { id: "5", title: "Entradas del concierto", friend: "Pablo", group: groups[0].name, amount: 48, direction: "owed", kind: "other", date: "14 jun", stage: "Pendiente" },
];

export function euros(amount: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(amount);
}
