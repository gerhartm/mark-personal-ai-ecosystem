import type { Metadata } from "next";
import { BrainExperience } from "./BrainExperience";

export const metadata: Metadata = {
  title: "ForkedBrain | Mark Gerhart",
  description: "Mark Gerhart's private personal AI ecosystem.",
};

export default function Home() {
  return <BrainExperience />;
}
