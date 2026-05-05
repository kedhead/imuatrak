export default function NotFound() {
  return (
    <main className="container" style={{ textAlign: "center", paddingTop: 96 }}>
      <h1 style={{ fontSize: 32, margin: 0 }}>Session not found</h1>
      <p className="muted" style={{ marginTop: 12 }}>
        This link may have expired, or the owner un-shared it.
      </p>
      <p style={{ marginTop: 24 }}>
        <a className="btn" href="/">Back to ImuaTrak</a>
      </p>
    </main>
  );
}
