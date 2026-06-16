import { BACKEND_URL } from "./ory";

export interface Car {
  id: string;
  make: string;
  model: string;
  year: number;
  price: number;
  mileage: number;
  fuel: string;
  image: string;
  description: string;
}

export interface Me {
  authenticated: boolean;
  id?: string;
  email?: string;
  name?: { first?: string; last?: string };
  /** True when the password step is done but the emailed code (AAL2) is still needed. */
  aal2Required?: boolean;
}

export interface Order {
  id: string;
  carId: string;
  email: string;
  createdAt: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: () => req<Me>("/api/me"),
  cars: () => req<Car[]>("/api/cars"),
  car: (id: string) => req<Car>(`/api/cars/${id}`),
  orders: () => req<Order[]>("/api/orders"),
  createOrder: (carId: string) =>
    req<Order>("/api/orders", {
      method: "POST",
      body: JSON.stringify({ carId }),
    }),
  ownership: () => req<{ carIds: string[] }>("/api/ownership"),
  transfer: (carId: string, toEmail: string) =>
    req<{ carId: string; transferredTo: string }>(
      `/api/cars/${carId}/transfer`,
      { method: "POST", body: JSON.stringify({ toEmail }) },
    ),
};
