import { ReactNode } from "react";
import { createBrowserRouter, useLoaderData } from "react-router-dom";
import { Root } from "./Root";
import * as Home from "./pages/Home";
import * as Parameterized from "./pages/Game";
import { Id } from "../convex/_generated/dataModel";

// eslint-disable-next-line react-refresh/only-export-components
function WrapElement<T>({ element }: { element: (props: T) => ReactNode }): ReactNode {
    return element(useLoaderData() as T);
}

export function getGameUrl(id: Id<'games'>, viewer: string) {
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
                path: getGameUrl(':id' as Id<'games'>, ':viewer'),
                loader: ({ params }): Parameterized.Props => ({ id: params.id! as Id<'games'>, viewer: params.viewer! }), // eslint-disable-line @typescript-eslint/no-non-null-assertion
                element: <WrapElement element={(props: Parameterized.Props) => <Parameterized.Page {...props} />} />,
            },
        ],
    },
]);
