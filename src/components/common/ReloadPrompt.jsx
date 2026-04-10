import { useRegisterSW } from 'virtual:pwa-register/react'

export default function ReloadPrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] bg-white border border-gray-300 rounded-lg shadow-lg p-4 max-w-sm">
      <p className="text-sm text-gray-700 mb-3">
        新しいバージョンが利用可能です。
      </p>
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => updateServiceWorker(true)}
          className="px-3 py-1.5 text-sm bg-[#032D60] text-white rounded hover:bg-[#044a8f] transition-colors"
        >
          更新する
        </button>
      </div>
    </div>
  )
}
