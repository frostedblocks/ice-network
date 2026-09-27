export default function Home() {
  return (
    <main style={{ padding: "2rem", maxWidth: 640 }}>
      <h1>ICE Connect Backend</h1>
      <p>
        Stripe Connect Express API for ICE Network personal stores. This origin
        is not a public product UI — use the documented <code>/api/*</code>{" "}
        routes from frostedblocks.com.
      </p>
      <ul>
        <li>
          <code>POST /api/connect/start</code>
        </li>
        <li>
          <code>GET /api/connect/callback</code>
        </li>
        <li>
          <code>GET /api/connect/result</code>
        </li>
        <li>
          <code>POST /api/checkout/session</code>
        </li>
        <li>
          <code>POST /api/webhooks/stripe</code>
        </li>
      </ul>
    </main>
  );
}
