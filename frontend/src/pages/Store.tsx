import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Car, type Me, type Order } from "../api";
import { logoutUrl, ory } from "../ory";

export default function Store() {
  const [me, setMe] = useState<Me | null>(null);
  const [cars, setCars] = useState<Car[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notice, setNotice] = useState<string>("");

  async function refreshOrders() {
    try {
      setOrders(await api.orders());
    } catch {
      setOrders([]);
    }
  }

  useEffect(() => {
    api
      .me()
      .then((m) => {
        // Password done but the emailed code is still required → step up to AAL2.
        if (m.aal2Required) {
          window.location.href = "/login?aal=aal2";
          return;
        }
        setMe(m);
      })
      .catch(() => setMe({ authenticated: false }));
    api.cars().then(setCars).catch(() => setCars([]));
  }, []);

  useEffect(() => {
    if (me?.authenticated) refreshOrders();
  }, [me?.authenticated]);

  async function logout() {
    try {
      const { data } = await ory.createBrowserLogoutFlow();
      window.location.href = data.logout_url;
    } catch {
      window.location.href = logoutUrl;
    }
  }

  async function buy(car: Car) {
    if (!me?.authenticated) {
      window.location.href = "/login";
      return;
    }
    try {
      await api.createOrder(car.id);
      setNotice(`Reserved a ${car.make} ${car.model}! Check "My orders" below.`);
      refreshOrders();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }

  const ordered = new Set(orders.map((o) => o.carId));

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="brand">
          🚗 AutoHub
        </Link>
        <nav className="topbar-actions">
          {me?.authenticated ? (
            <>
              <span className="hi">Hi, {me.name?.first || me.email}</span>
              <Link to="/settings" className="btn btn-ghost">
                Settings
              </Link>
              <button onClick={logout} className="btn btn-ghost">
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost">
                Sign in
              </Link>
              <Link to="/registration" className="btn btn-primary">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="hero">
        <h1>Find your next car</h1>
        <p>Hand-picked vehicles, transparent pricing. Sign in to reserve one.</p>
      </section>

      {notice && <div className="notice">{notice}</div>}

      <section className="grid">
        {cars.map((car) => (
          <article key={car.id} className="card">
            <div
              className="card-img"
              style={{ backgroundImage: `url(${car.image})` }}
            />
            <div className="card-body">
              <div className="card-head">
                <h3>
                  {car.make} {car.model}
                </h3>
                <span className="price">${car.price.toLocaleString()}</span>
              </div>
              <p className="specs">
                {car.year} · {car.mileage.toLocaleString()} mi · {car.fuel}
              </p>
              <p className="desc">{car.description}</p>
              <button
                className="btn btn-primary full"
                onClick={() => buy(car)}
                disabled={ordered.has(car.id)}
              >
                {ordered.has(car.id) ? "Reserved ✓" : "Reserve"}
              </button>
            </div>
          </article>
        ))}
      </section>

      {me?.authenticated && orders.length > 0 && (
        <section className="orders">
          <h2>My orders</h2>
          <ul>
            {orders.map((o) => {
              const car = cars.find((c) => c.id === o.carId);
              return (
                <li key={o.id}>
                  {car ? `${car.make} ${car.model}` : o.carId} —{" "}
                  {new Date(o.createdAt).toLocaleString()}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <footer className="footer">
        Authentication powered by Ory Kratos · Demo project
      </footer>
    </div>
  );
}
