import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import Layout from './components/Layout';
import TicketList from './pages/TicketList';
import TicketDetail from './pages/TicketDetail';
import TicketForm from './pages/TicketForm';
import TagList from './pages/TagList';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/tickets', element: <TicketList /> },
      // keyを分けて作成⇔編集の遷移でフォームの状態が引き継がれないようにする
      { path: '/tickets/new', element: <TicketForm key="new" /> },
      { path: '/tickets/:id', element: <TicketDetail /> },
      { path: '/tickets/:id/edit', element: <TicketForm key="edit" /> },
      { path: '/tags', element: <TagList /> },
      { path: '/*', element: <TicketList /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
