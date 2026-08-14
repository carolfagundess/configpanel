// Navegação lateral reutilizável, baseada na .sidebar/.nav-btn do MVP original.
// `items` agrupa os botões de navegação por seção (INÍCIO, INFRAESTRUTURA, DEMAIS SERVIÇOS).

const SECTIONS = [
  {
    title: 'Início',
    items: [
      {
        id: 'home',
        label: 'Início',
        icon: (
          <>
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9,22 9,12 15,12 15,22" />
          </>
        ),
      },
      {
        id: 'novo',
        label: 'Novo Acesso',
        badge: 2,
        icon: (
          <>
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
            <line x1="6" y1="6" x2="6.01" y2="6"></line>
            <line x1="6" y1="18" x2="6.01" y2="18"></line>
          </>
        ),
      },
    ],
  },
  {
    title: 'Infraestrutura',
    items: [
      {
        id: 'ciasc',
        label: 'Ferramentas CIASC',
        badge: 2,
        icon: (
          <>
            <polyline points="4 17 10 11 4 5"></polyline>
            <line x1="12" y1="19" x2="20" y2="19"></line>
          </>
        ),
      },
      {
        id: 'wifi',
        label: 'Wifi Business',
        icon: (
          <>
            <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
            <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
            <line x1="12" y1="20" x2="12.01" y2="20"></line>
          </>
        ),
      },
      {
        id: 'ipv4',
        label: 'Calculadora IPv4',
        icon: (
          <>
            <rect x="4" y="2" width="16" height="20" rx="2"></rect>
            <line x1="8" y1="6" x2="16" y2="6"></line>
            <line x1="8" y1="10" x2="8.01" y2="10"></line>
            <line x1="12" y1="10" x2="12.01" y2="10"></line>
            <line x1="16" y1="10" x2="16.01" y2="10"></line>
            <line x1="8" y1="14" x2="8.01" y2="14"></line>
            <line x1="12" y1="14" x2="12.01" y2="14"></line>
            <line x1="16" y1="14" x2="16.01" y2="14"></line>
            <line x1="8" y1="18" x2="16" y2="18"></line>
          </>
        ),
      },
    ],
  },
  {
    title: 'Demais Serviços',
    items: [
      {
        id: 'equip',
        label: 'Verificador Equip.',
        icon: (
          <>
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
            <path d="M9 14l2 2 4-4"></path>
          </>
        ),
      },
    ],
  },
];

export default function Sidebar({ active, onNavigate }) {
  return (
    <nav className="sidebar">
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <div className="sidebar-section">{section.title}</div>
          {section.items.map((item) => (
            <button
              key={item.id}
              className={`nav-btn${active === item.id ? ' active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <svg
                className="nav-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                {item.icon}
              </svg>
              {item.label}
              {item.badge != null && <span className="nav-badge">{item.badge}</span>}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
