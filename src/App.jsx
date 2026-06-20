import React from 'react'
import Inventory from './Inventory'

function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans selection:bg-indigo-500/20 selection:text-indigo-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <Inventory />
      </div>
    </div>
  )
}

export default App
