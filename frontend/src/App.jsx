import { useState } from 'react';
import Sidebar from './components/Sidebar';
import RouterBoardForm from './pages/RouterBoardForm';

const PAGE_TITLES = {
  home: 'Início',
  ciasc: 'Ferramentas CIASC',
  wifi: 'Wifi Business',
  ipv4: 'Calculadora IPv4',
  equip: 'Verificador de Equipamentos',
};

function EmBreve({ page }) {
  return (
    <div className="page active">
      <div className="tool-page-header">
        <div>
          <h2>{PAGE_TITLES[page] ?? page}</h2>
          <p>Esta ferramenta ainda não foi portada para o novo painel.</p>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [page, setPage] = useState('novo');

  return (
    <>
      <div className="topbar">
        <div className="topbar-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          Painel de Ferramentas · CRC
        </div>
        <div className="topbar-sep"></div>
        <div className="topbar-status">
          <div className="dot"></div>
          Ferramentas ativas
        </div>
      </div>

      <div className="layout">
        <Sidebar active={page} onNavigate={setPage} />
        <main className="main">
          {page === 'novo' ? <RouterBoardForm /> : <EmBreve page={page} />}
        </main>
      </div>
    </>
  );
}

export default App;
