import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface RouteRequest {
  origin: { latitude: number; longitude: number };
  destinationAddress: string;
}

export interface RouteResult {
  /** Provider-encoded geometry; the provider names its encoding. */
  geometry: { encoding: string; value: string };
  distanceMetres: number;
  durationSeconds: number;
}

/** Implement this provider and bind it to RoutingProvider in LocationsModule. */
export abstract class RoutingProvider {
  abstract route(request: RouteRequest): Promise<RouteResult>;
}

@Injectable()
export class UnconfiguredRoutingProvider extends RoutingProvider {
  async route(): Promise<RouteResult> {
    throw new ServiceUnavailableException('Routing provider is not configured');
  }
}
