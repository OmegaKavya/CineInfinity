import { useNavigate, useParams } from 'react-router-dom';
import WatchOrder from '../components/WatchOrder';

/** The watch-order resolver at its own address, so an order can be linked to. */
export default function AnimePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <main className="app-main">
      <WatchOrder
        anime={{ id: Number(id), title: '' }}
        onClose={() => navigate('/')}
        onSelect={(item) => navigate(`/anime/${item.id}`)}
      />
    </main>
  );
}
