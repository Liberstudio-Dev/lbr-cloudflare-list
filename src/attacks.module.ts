import { DynamicModule, type MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { APP_FILTER } from "@nestjs/core";

import { AllExceptionsFilter } from "./filters";
import { AttacksService } from "./attacks.service";
import { AttackLoggerMiddleware } from "./middleware";
import { CLOUDFLARE_OPTIONS, validateOptions } from "./utils";

import type { CloudflareAttacksAsyncOptions, CloudflareAttacksOptions } from "./interfaces";

@Module({
  imports: [HttpModule],
  providers: [
    AttacksService,
    AttackLoggerMiddleware,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
  exports: [AttacksService, HttpModule],
})
export class CloudflareAttacksModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AttackLoggerMiddleware).forRoutes("*");
  }

  static forRoot(options: CloudflareAttacksOptions): DynamicModule {
    validateOptions(options);

    return {
      module: CloudflareAttacksModule,
      imports: [HttpModule],
      providers: [
        {
          provide: CLOUDFLARE_OPTIONS,
          useValue: options,
        },
      ],
    };
  }

  static forRootAsync(options: CloudflareAttacksAsyncOptions): DynamicModule {
    return {
      module: CloudflareAttacksModule,
      imports: [HttpModule, ...(options.imports || [])],
      providers: [
        {
          provide: CLOUDFLARE_OPTIONS,
          useFactory: async (...args: any[]) => {
            const opts = await options.useFactory(...args);
            validateOptions(opts);
            return opts;
          },
          inject: options.inject || [],
        },
      ],
    };
  }
}
