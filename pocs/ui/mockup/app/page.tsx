import { landing } from '@/data/mock';
import { LandingScreen } from '@/screens/01-landing';

export default function Page() {
  return <LandingScreen data={landing} />;
}
