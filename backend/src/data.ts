export interface Car {
  id: string;
  make: string;
  model: string;
  year: number;
  price: number;
  mileage: number;
  fuel: "Petrol" | "Diesel" | "Electric" | "Hybrid";
  image: string;
  description: string;
}

export interface Order {
  id: string;
  carId: string;
  identityId: string;
  username: string;
  createdAt: string;
}

export const cars: Car[] = [
  {
    id: "c1",
    make: "Tesla",
    model: "Model 3",
    year: 2023,
    price: 41990,
    mileage: 8200,
    fuel: "Electric",
    image: "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=800",
    description:
      "Long Range AWD. Autopilot, glass roof, and a 15-inch central touchscreen.",
  },
  {
    id: "c2",
    make: "Toyota",
    model: "Corolla",
    year: 2022,
    price: 23500,
    mileage: 19400,
    fuel: "Hybrid",
    image: "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800",
    description: "Reliable hybrid sedan with excellent fuel economy and low running costs.",
  },
  {
    id: "c3",
    make: "BMW",
    model: "330i",
    year: 2021,
    price: 38900,
    mileage: 27600,
    fuel: "Petrol",
    image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800",
    description: "Sport package, leather interior, and a turbocharged 2.0L engine.",
  },
  {
    id: "c4",
    make: "Volkswagen",
    model: "Golf GTI",
    year: 2020,
    price: 28750,
    mileage: 34100,
    fuel: "Petrol",
    image: "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800",
    description: "The iconic hot hatch. DSG gearbox, adaptive suspension, plaid seats.",
  },
  {
    id: "c5",
    make: "Audi",
    model: "e-tron GT",
    year: 2023,
    price: 104900,
    mileage: 4300,
    fuel: "Electric",
    image: "https://images.unsplash.com/photo-1614200187524-dc4b892acf16?w=800",
    description: "Grand tourer EV with 522 hp, quattro AWD, and 800V fast charging.",
  },
  {
    id: "c6",
    make: "Mazda",
    model: "CX-5",
    year: 2022,
    price: 31200,
    mileage: 15800,
    fuel: "Diesel",
    image: "https://images.unsplash.com/photo-1568844293986-8d0400bd4745?w=800",
    description: "Premium compact SUV with all-wheel drive and a refined interior.",
  },
];

// Simple in-memory order store (resets on restart — fine for a demo).
export const orders: Order[] = [];
