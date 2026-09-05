import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./pages/home";
import Play from "./pages/play";
import DesignKitDemo from "./pages/_design";
import { ThemeProvider } from "@/components/theme-provider";

export default function App() {
  return (
    <ThemeProvider defaultTheme="light">
      <BrowserRouter>
        <Routes>
          <Route path="/_design" element={<DesignKitDemo />} />
          <Route path="/play/:slug" element={<Play />} />
          <Route path="/" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
