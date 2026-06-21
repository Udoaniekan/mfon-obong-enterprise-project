import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseObjectIdPipe implements PipeTransform<any, string> {
  transform(value: any): string {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('Invalid ID');
    }
    return value.trim();
  }
}
