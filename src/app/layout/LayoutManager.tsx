import React, { useEffect, useRef } from "react";
import { GoldenLayout } from "golden-layout";
import "golden-layout/dist/css/goldenlayout-base.css";
import "golden-layout/dist/css/themes/goldenlayout-light-theme.css";
import type { PanelRegistry, LayoutConfig } from "../dsl/types";
import { PanelRenderer } from "../PanelRenderer";

export function LayoutManager(props: { panels: PanelRegistry; layout: LayoutConfig }) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const glRef = useRef<GoldenLayout | null>(null);

    useEffect(() => {
        if (!rootRef.current) return;

        const gl = new GoldenLayout(rootRef.current);
        glRef.current = gl;

        // register each panel id as a GL component
        for (const [id, panel] of props.panels.entries()) {
            gl.registerComponentFactoryFunction(id, container => {
                const el = document.createElement("div");
                el.className = "gl-panel-root";
                container.element.append(el);
                container.setTitle(panel.title || id);

                // mount React component into this element
                import("react-dom/client").then(({ createRoot }) => {
                    const root = createRoot(el);
                    root.render(<PanelRenderer panel={panel} />);
                    container.on("destroy", () => {
                        root.unmount();
                    });
                });
            });
        }

        gl.loadLayout(props.layout as any);

        const handleResize = () => gl.updateSize(window.innerWidth, window.innerHeight);
        window.addEventListener("resize", handleResize);
        handleResize();

        return () => {
            window.removeEventListener("resize", handleResize);
            try {
                gl.clear();
            } catch {
                // swallow
            }
            glRef.current = null;
        };
    }, [props.panels, props.layout]);

    return <div ref={rootRef} className="gl-root" style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }} />;
}
