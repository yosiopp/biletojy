import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Header from './Header';

// ショートカットキー
//   ctrl+n        チケット作成
//   ctrl+e        表示中のチケット編集
//   ctrl+l        チケット一覧へ移動
//   ctrl+t        タグ一覧へ移動
//   ctrl+shift+n  タグ作成
function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const eventListener = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'n' && event.shiftKey) {
        navigate('/tags?new=1');
      } else if (key === 'n') {
        navigate('/tickets/new');
      } else if (key === 'e') {
        const match = location.pathname.match(/^\/tickets\/(\d+)$/);
        if (!match) return;
        navigate(`/tickets/${match[1]}/edit`);
      } else if (key === 'l') {
        navigate('/tickets');
      } else if (key === 't') {
        navigate('/tags');
      } else {
        return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', eventListener);
    return () => window.removeEventListener('keydown', eventListener);
  }, [navigate, location]);

  return (
    <>
      <Header />
      <main className="p-2">
        <Outlet />
      </main>
    </>
  );
}

export default Layout;
