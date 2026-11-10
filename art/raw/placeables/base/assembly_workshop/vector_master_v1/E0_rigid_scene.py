"""Общий векторный исходник жёстких объектов E0 с прямым растровым экспортом.

Не изменяет изображения imagegen. SVG и PNG строятся из одних команд геометрии.
Камера — прокси утверждённого острова, не восстановленная настоящая 3D-камера.
"""
import json
from hashlib import sha256
from math import cos, sin, radians, pi
from pathlib import Path
from xml.sax.saxutils import escape
from PIL import Image, ImageDraw

class RigidScene:
    def __init__(self, width=1100, height=900, scale=95, origin=(550,500), taper=.008):
        self.width,self.height,self.scale,self.origin,self.taper=width,height,scale,origin,taper
        self.angle=radians(73.44)
        self.image=Image.new('RGBA',(width,height))
        self.draw=ImageDraw.Draw(self.image)
        self.svg=[]
        self.landmarks={}
    def project(self,x,y,z):
        f=1+y*self.taper
        return (self.origin[0]+self.scale*x*f,
                self.origin[1]+self.scale*(y*sin(self.angle)-z*cos(self.angle))*f)
    def polygon(self,points,color,outline='#303b43',stroke=1):
        pts=[self.project(*p) for p in points]
        self.draw.polygon(pts,fill=color)
        if outline and stroke:
            self.draw.line(pts+[pts[0]],fill=outline,width=stroke,joint='curve')
        coordinates=' '.join(f'{x:.3f},{y:.3f}' for x,y in pts)
        self.svg.append(f'<polygon points="{coordinates}" fill="{color}" stroke="{outline or "none"}" stroke-width="{stroke}"/>')
    def line(self,points,color,width=1):
        pts=[self.project(*p) for p in points]
        self.draw.line(pts,fill=color,width=width,joint='curve')
        coordinates=' '.join(f'{x:.3f},{y:.3f}' for x,y in pts)
        self.svg.append(f'<polyline points="{coordinates}" fill="none" stroke="{color}" stroke-width="{width}"/>')
    def disc(self,x,y,z,radius,color,normal='z'):
        pts=[]
        for i in range(24):
            a=2*pi*i/24
            if normal=='z': p=(x+radius*cos(a),y+radius*sin(a),z)
            elif normal=='y': p=(x+radius*cos(a),y,z+radius*sin(a))
            else: p=(x,y+radius*cos(a),z+radius*sin(a))
            pts.append(p)
        self.polygon(pts,color,stroke=1)
    def box(self,x0,x1,y0,y1,z0,z1,colors):
        top,front,side=colors
        self.polygon([(x1,y0,z0),(x1,y1,z0),(x1,y1,z1),(x1,y0,z1)],side)
        self.polygon([(x0,y1,z0),(x1,y1,z0),(x1,y1,z1),(x0,y1,z1)],front)
        self.polygon([(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)],top)
    def mark(self,name,point):
        self.landmarks[name]={'world_m':point,'screen_px':self.project(*point)}
    def save(self,stem,description):
        stem=Path(stem)
        self.image.save(stem.with_suffix('.png'))
        text=f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.width}" height="{self.height}" viewBox="0 0 {self.width} {self.height}"><desc>{escape(description)}</desc>'+''.join(self.svg)+'</svg>'
        stem.with_suffix('.svg').write_text(text,encoding='utf-8')
        data={'authoring':'parametric_vector_source','status':'prototype_not_approved',
              'actual_camera_angle':'UNKNOWN','elevation_proxy_deg':73.44,
              'ground_compression_proxy':sin(self.angle),'perspective_taper_per_m':self.taper,
              'pixels_per_meter':self.scale,'landmarks':self.landmarks,
              'png_sha256':sha256(stem.with_suffix('.png').read_bytes()).hexdigest(),
              'svg_sha256':sha256(stem.with_suffix('.svg').read_bytes()).hexdigest()}
        stem.with_suffix('.geometry.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

