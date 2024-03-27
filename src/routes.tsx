import { ReactNode } from "react";
import { createBrowserRouter, useLoaderData } from "react-router-dom";
import { Root } from "./Root";
import * as Home from "./pages/Home";
import * as Game from "./pages/Game";
import * as Play from "./pages/Play";
import { Id } from "../convex/_generated/dataModel";

// eslint-disable-next-line react-refresh/only-export-components
function WrapElement<T>({ element }: { element: (props: T) => ReactNode }): ReactNode {
    return element(useLoaderData() as T);
}

export function getGameUrl(id: Id<'games'>) {
    return `/g/${id}`;
}

export function getPlayUrl(id: Id<'games'>, viewer: string) {
    return `/g/${id}/${viewer}`;
}

export const router = createBrowserRouter([
    {
        path: "/",
        element: <Root />,
        children: [
            {
                path: "/",
                element: <Home.Page />,
            },
            {
                path: getGameUrl(':id' as Id<'games'>),
                loader: ({ params }): Game.Props => ({ id: params.id! as Id<'games'> }), // eslint-disable-line @typescript-eslint/no-non-null-assertion
                element: <WrapElement element={(props: Game.Props) => <Game.Page {...props} />} />,
            },
            {
                path: getPlayUrl(':id' as Id<'games'>, ':viewer'),
                loader: ({ params }): Play.Props => ({ id: params.id! as Id<'games'>, viewer: params.viewer! }), // eslint-disable-line @typescript-eslint/no-non-null-assertion
                element: <WrapElement element={(props: Play.Props) => <Play.Page {...props} />} />,
            },
        ],
    },
]);
