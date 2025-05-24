import Head from 'next/head'

export default function Home() {
  return (
    <>
      <Head>
        <title>CRM Autopilot</title>
      </Head>
      <main className="min-h-screen bg-white p-10 font-sans">
        <h1 className="text-3xl font-bold mb-6">CRM Autopilot</h1>
        <p className="mb-4">This tool runs in the background and syncs investor meetings from your calendar to your Google Sheet CRM using GPT + Fireflies.</p>
        <a href="/api/sync" className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition">Run Sync Now</a>
      </main>
    </>
  )
}
