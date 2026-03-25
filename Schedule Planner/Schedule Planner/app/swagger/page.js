export const metadata = {
  title: "Swagger API Docs",
  description: "API docs cho Schedule Planner",
};

export default function SwaggerPage() {
  return (
    <main style={{ width: "100%", height: "100vh", margin: 0, padding: 0 }}>
      <iframe
        src="/api/docs"
        title="Swagger API Docs"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      />
    </main>
  );
}
