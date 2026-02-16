import { DynamicModule, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AttacksService } from './attacks.service';
import type { CloudflareAttacksAsyncOptions, CloudflareAttacksOptions } from './interfaces';

@Module({
  imports: [HttpModule],
  providers: [AttacksService],
  exports: [AttacksService, HttpModule],
})
export class CloudflareAttacksModule {

  static forRoot(options: CloudflareAttacksOptions): DynamicModule {
    return {
      module: CloudflareAttacksModule,
      imports: [HttpModule],
      providers: [
        {
          provide: 'CLOUDFLARE_OPTIONS',
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
          provide: 'CLOUDFLARE_OPTIONS',
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
      ],
    };
  }
}
