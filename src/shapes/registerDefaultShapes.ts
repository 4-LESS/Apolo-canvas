import { ShapeRegistry } from './ShapeRegistry';
import { ArrowShape } from './definitions/ArrowShape';
import { EllipseShape } from './definitions/EllipseShape';
import { LineShape } from './definitions/LineShape';
import { RectangleShape } from './definitions/RectangleShape';
import { RoundedRectangleShape } from './definitions/RoundedRectangleShape';
import { TriangleShape } from './definitions/TriangleShape';

let registered = false;

export function registerDefaultShapes(): void {
    if (registered) return;
    ShapeRegistry.register(LineShape);
    ShapeRegistry.register(ArrowShape);
    ShapeRegistry.register(RectangleShape);
    ShapeRegistry.register(EllipseShape);
    ShapeRegistry.register(TriangleShape);
    ShapeRegistry.register(RoundedRectangleShape);
    registered = true;
}
