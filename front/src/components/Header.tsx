import { Link } from 'react-router-dom';

function Header() {
  return (
    <header>
      <div className="flex items-center pb-1 border-b px-2">
        <h1 className="text-2xl inline mr-4">
          <Link to="/tickets">biletojy</Link>
        </h1>

        <nav className="inline flex-1">
          <ul className="inline-flex">
            <li>
              <Link className="mx-2 text-blue-700 hover:underline" to="/tickets">
                tickets
              </Link>
            </li>
            <li>
              <Link className="mx-2 text-blue-700 hover:underline" to="/tags">
                tags
              </Link>
            </li>
          </ul>
        </nav>

        <Link
          to="/tickets/new"
          className="bg-blue-600 text-white rounded px-3 py-1 text-sm hover:bg-blue-700"
          title="ctrl+n"
        >
          + 新規チケット
        </Link>
      </div>
    </header>
  );
}

export default Header;
