import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import Home from './pages/Home'
import PostDeal from './pages/PostDeal'
import DealPosted from './pages/DealPosted'
import ManageDeal from './pages/ManageDeal'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f7f9fc]">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/post" element={<PostDeal />} />
          <Route path="/posted/:id" element={<DealPosted />} />
          <Route path="/manage/:id" element={<ManageDeal />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
