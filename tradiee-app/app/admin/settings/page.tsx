export default function AdminSettings() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Admin settings</h1>
        <p className="text-gray-400 text-sm mt-1">Platform configuration</p>
      </div>

      <div className="max-w-xl space-y-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-1">Bootstrap admin account</h2>
          <p className="text-xs text-gray-500 mb-4">
            To create the first super-admin, POST to <code className="bg-gray-800 px-1 py-0.5 rounded text-orange-400">/api/admin/setup</code> with:
          </p>
          <pre className="bg-gray-800 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto">{`curl -X POST /api/admin/setup \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "admin@yourdomain.com",
    "password": "...",
    "secret": "<ADMIN_SETUP_SECRET env var>"
  }'`}</pre>
          <p className="text-xs text-gray-500 mt-3">Set <code className="bg-gray-800 px-1 py-0.5 rounded text-orange-400">ADMIN_SETUP_SECRET</code> in your environment variables.</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-1">PowerSync</h2>
          <p className="text-xs text-gray-500">
            Set <code className="bg-gray-800 px-1 py-0.5 rounded text-orange-400">NEXT_PUBLIC_POWERSYNC_URL</code> in your environment variables to enable offline sync.
            Project name: <strong className="text-gray-300">IndustryForms</strong>. Paste <code className="text-orange-400">sync-rules.yaml</code> into the PowerSync dashboard.
          </p>
        </div>
      </div>
    </div>
  )
}
