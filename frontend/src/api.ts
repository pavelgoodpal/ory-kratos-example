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
  username?: string;
  name?: { first?: string; last?: string };
}

export interface Order {
  id: string;
  carId: string;
  email: string;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  htmlLink: string;
  start: string;
  end: string;
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
  scheduleVisit: (carId: string, startISO: string) =>
    req<CalendarEvent>("/api/visits", {
      method: "POST",
      body: JSON.stringify({
        carId,
        start: startISO,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    }),
  calendarStatus: () =>
    req<{ connected: boolean }>("/api/google/calendar/status"),
};
