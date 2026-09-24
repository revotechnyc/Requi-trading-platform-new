import AutonomousShell from '../autonomous/AutonomousShell';

/** Autonomous console — client dark look, embedded in AppLayout. */
export default function Autonomous() {
  return (
    <div className="-mx-5 -my-6 flex min-h-[calc(100vh-4rem)] flex-col lg:-mx-8 lg:-my-8">
      <AutonomousShell embedded />
    </div>
  );
}
