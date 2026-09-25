// The text interface entry point (design 07 §8, the text slice).
import { render } from "preact";
import { App } from "./App.js";
import "./style.css";

render(<App />, document.getElementById("app")!);
