import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Layout } from 'antd'
import TradingPage from './pages/TradingPage'
import './App.css'

const { Header, Content } = Layout

function App() {
  return (
    <Router>
      <Layout className="app-layout">
        <Header className="app-header">
          <div className="logo">
            <h1>K线策略模拟器</h1>
          </div>
        </Header>
        <Content className="app-content">
          <Routes>
            <Route path="/" element={<TradingPage />} />
            <Route path="/trading" element={<TradingPage />} />
          </Routes>
        </Content>
      </Layout>
    </Router>
  )
}

export default App