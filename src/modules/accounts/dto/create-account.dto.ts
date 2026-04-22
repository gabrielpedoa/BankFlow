import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @Matches(/[a-zA-ZÀ-ÿ]/, {
    message: 'name must contain at least one letter',
  })
  name: string;
}
